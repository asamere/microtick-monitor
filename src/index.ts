import axios from 'axios'
import twilio from 'twilio'
import { BlockData, BlockRange, SigningState, Signature, State } from './types'

const {
    TWILIO_SID,
    TWILIO_TOKEN,
    MTNODE_BASE_URL,
    ALERT_PHONE,
    FROM_PHONE,
    CHECK_FREQUENCY,
    WATCH_VALIDATOR_ADDRESS
} = process.env

const checkFrequency = parseInt(CHECK_FREQUENCY)

// axios instance
const instance = axios.create({
    baseURL: MTNODE_BASE_URL,
    timeout: 10000
})

// twilio instance
const twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN)

const state: State = {
    signing: SigningState.SIGNING,
    processedHeight: 0
}

async function getLatestBlock() {
    const { data: blockData } = await instance.get<BlockData>('/blocks/latest')
    return blockData
}

async function getBlockByHeight(height: number) {
    const { data: blockData } = await instance.get<BlockData>(`/blocks/${height}`)
    return blockData
}

async function sendAlert(height: number, recovered: boolean = false): Promise<void> {
    console.log(`sending ${recovered ? 'recovered ' : ''}alert`)
    const body = recovered ? `Recovered: Validator is signing as of height ${height}` : `Validator Missing Blocks! Height = ${height}`

    await twilioClient.messages.create({
        to: ALERT_PHONE,
        from: FROM_PHONE,
        body
    })
}

let lastAlert = 0
const debouncePeriod = 60 * 60 * 1000 // 60 minutes
async function onMissingSignature(height: number): Promise<void> {
    console.warn(`Signature missing from last commit in block ${height}`)
    // are we transitioning to not signing?
    if (state.signing === SigningState.SIGNING) {
        console.warn('transitioning from signing to not signing state')
        state.signing = SigningState.NOT_SIGNING
        const now = Date.now()
        if ((now - lastAlert) > debouncePeriod) {
            await sendAlert(height)
            lastAlert = now
        }
    }
}

async function onValidSignatures(height: number): Promise<void> {
    // send recovered alert if signing again
    state.signing !== SigningState.SIGNING && await sendAlert(height, true)
    state.signing = SigningState.SIGNING
}

async function monitor() {
    try {
        let latestBlock = await getLatestBlock()
        console.log(`monitor: latestHeight = ${latestBlock.block.header.height}, latestProcessed = ${state.processedHeight}`)
        const range: BlockRange = {
            start: state.processedHeight + 1,
            end: parseInt(latestBlock.block.header.height)
        }
        // first run after start
        if (state.processedHeight === 0) {
            range.start = parseInt(latestBlock.block.header.height)
        }

        let missingSigHeight: number
        let height: number
        while (range.start <= range.end) {
            const blockData = await getBlockByHeight(range.start)
            const { block, block_id, block: { last_commit, header } } = blockData
            height = parseInt(header.height)
            console.log(`monitor: checking block at height ${height}, hash = ${block_id.hash}`)
            const validatorSig = last_commit.signatures.find((s: Signature) => s.validator_address === WATCH_VALIDATOR_ADDRESS)

            !validatorSig && (missingSigHeight = parseInt(header.height))
            range.start++
        }

        missingSigHeight ? await onMissingSignature(missingSigHeight) : await onValidSignatures(height)
        state.processedHeight = range.end
    } catch (e) {
        console.error('Error monitoring: ', e)
    } finally {
        // schedule next run
        setTimeout(monitor, checkFrequency)
    }
}

console.log(`Starting monitoring of validator ${WATCH_VALIDATOR_ADDRESS}`)
monitor().then(() => console.log('started monitoring'))
