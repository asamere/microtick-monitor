import axios, { AxiosError } from 'axios'
import twilio from 'twilio'
import { BlockData, SigningState, Signature, State } from './types'

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

async function getLatestBlock(): Promise<BlockData> {
    const { data: blockData } = await instance.get<BlockData>('/blocks/latest')
    return blockData
}

async function getBlockByHeight(height: number): Promise<BlockData> {
    try {
        const { data: blockData } = await instance.get<BlockData>(`/blocks/${height}`)
        return blockData
    } catch (e) {
        if (e?.response?.status === 404) {
            console.log(`block not found at heigth ${height}`)
            return null
        }
        throw e
    }
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
    console.warn(`monitor: Signature missing from last commit in block ${height}`)
    // are we transitioning to not signing?
    if (state.signing === SigningState.SIGNING) {
        console.warn('monitor: transitioning from signing to not signing state')
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
        let height = state.processedHeight
        if (height === 0) {
            const latestBlock = await getLatestBlock()
            height = parseInt(latestBlock.block.header.height)
            console.log(`monitor: Starting monitoring at height ${height}`)
        }

        let missingSigHeight: number
        let blockData: BlockData
        while (blockData = await getBlockByHeight(height)) {
            const { block, block_id, block: { last_commit, header } } = blockData
            height = parseInt(header.height)
            console.log(`monitor: checking block at height ${height}, hash = ${block_id.hash}`)
            const validatorSig = last_commit.signatures.find((s: Signature) => s.validator_address === WATCH_VALIDATOR_ADDRESS)

            !validatorSig && (missingSigHeight = height)
            height++
        }

        missingSigHeight ? await onMissingSignature(missingSigHeight) : await onValidSignatures(height)
        state.processedHeight = height - 1
    } catch (e) {
        console.error('monitor: Error monitoring ', e)
    } finally {
        // schedule next run
        setTimeout(monitor, checkFrequency)
    }
}

console.log(`Starting monitoring of validator ${WATCH_VALIDATOR_ADDRESS}`)
monitor().then(() => console.log('started monitoring'))
