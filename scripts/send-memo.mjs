// Send one memo'd USDC payment on Arc mainnet, so this project has a
// transaction of its own that anyone can verify — including on its own site.
//
// The payment goes to the sender's own address, so the USDC comes straight
// back and only gas is actually spent.
//
//   node scripts/send-memo.mjs                 # dry run: prints the plan, sends nothing
//   node scripts/send-memo.mjs --send          # signs and broadcasts
//
// Requires ARC_PRIVATE_KEY in the environment. Never commit it; .env is ignored.

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  keccak256,
  parseGwei,
  stringToHex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arc } from 'viem/chains'

const RPC = process.env.ARC_RPC_URL ?? 'https://rpc.mainnet.arc.io'
const MEMO_CONTRACT = '0x5294e9927c3306dcbadb03fe70b92e01ccede505'
const USDC_ERC20 = '0x3600000000000000000000000000000000000000'

// --- spending guards -------------------------------------------------------
// Absolute, not relative. This script can only ever cost gas, and only up to
// this much. If the estimate exceeds it, nothing is signed.
const MAX_FEE_USDC = 0.05
// What the payment moves, in the ERC-20 view's 6 decimals. It returns to the
// sender, so this is not spent — it only has to be non-zero.
const AMOUNT_UNITS = 100n // 0.0001 USDC
const MAX_FEE_PER_GAS = parseGwei('30') // Arc drops anything under 20 Gwei, silently
const MAX_PRIORITY_FEE_PER_GAS = parseGwei('1')

const MEMO_TEXT = process.env.MEMO_TEXT ?? 'arcstamp: a receipt for every USDC payment on Arc'

const MEMO_ABI = [
  {
    type: 'function',
    name: 'memo',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'data', type: 'bytes' },
      { name: 'memoId', type: 'bytes32' },
      { name: 'memoData', type: 'bytes' },
    ],
    outputs: [],
  },
  // The predeploy wraps an inner call; when that call reverts it surfaces here.
  { type: 'error', name: 'MemoFailed', inputs: [{ name: 'returnData', type: 'bytes' }] },
]

async function main() {
  const send = process.argv.includes('--send')
  const key = process.env.ARC_PRIVATE_KEY

  if (!key) {
    console.error('ARC_PRIVATE_KEY is not set. Export it in this shell only; do not write it to a file.')
    process.exitCode = 1
    return
  }

  const account = privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`)
  const publicClient = createPublicClient({ chain: arc, transport: http(RPC) })

  console.log(`network   Arc mainnet, chain ${arc.id}`)
  console.log(`account   ${account.address}`)

  const balance = await publicClient.getBalance({ address: account.address })
  console.log(`balance   ${formatUnits(balance, 18)} USDC`)

  const transferData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [account.address, AMOUNT_UNITS],
  })

  const args = [USDC_ERC20, transferData, keccak256(stringToHex('arcstamp')), stringToHex(MEMO_TEXT)]

  let gas
  try {
    gas = await publicClient.estimateContractGas({
      address: MEMO_CONTRACT,
      abi: MEMO_ABI,
      functionName: 'memo',
      args,
      account,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('MemoFailed') || message.includes('0xed1966a2')) {
      console.error(
        '\nThe Memo predeploy accepted the call but the inner USDC transfer reverted.' +
          '\nThe usual cause is an empty account: this wallet holds no USDC on Arc yet.' +
          '\nFund it first — on Arc, receiving USDC is also receiving gas.',
      )
      process.exitCode = 1
      return
    }
    throw error
  }

  const worstCaseFee = gas * MAX_FEE_PER_GAS
  const worstCaseUsdc = Number(formatUnits(worstCaseFee, 18))

  console.log(`memo      ${JSON.stringify(MEMO_TEXT)}`)
  console.log(`gas       ${gas} units, at most ${worstCaseUsdc.toFixed(6)} USDC in fees`)

  if (worstCaseUsdc > MAX_FEE_USDC) {
    console.error(`REFUSING: worst-case fee ${worstCaseUsdc} USDC exceeds the ${MAX_FEE_USDC} USDC cap in this script.`)
    process.exitCode = 1
    return
  }

  if (balance < worstCaseFee) {
    console.error(`REFUSING: balance ${formatUnits(balance, 18)} USDC cannot cover the worst-case fee.`)
    process.exitCode = 1
    return
  }

  if (!send) {
    console.log('\nDry run. Nothing was signed or broadcast. Re-run with --send to do it for real.')
    return
  }

  const walletClient = createWalletClient({ account, chain: arc, transport: http(RPC) })

  const hash = await walletClient.writeContract({
    address: MEMO_CONTRACT,
    abi: MEMO_ABI,
    functionName: 'memo',
    args,
    gas,
    maxFeePerGas: MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  })

  console.log(`\nsent      ${hash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const paid = receipt.gasUsed * receipt.effectiveGasPrice

  console.log(`status    ${receipt.status}`)
  console.log(`paid      ${formatUnits(paid, 18)} USDC in fees`)
  console.log(`\nreceipt   https://arcstamp.vercel.app/r/${hash}`)
  console.log(`explorer  https://explorer.arc.io/tx/${hash}`)

}

await main()
