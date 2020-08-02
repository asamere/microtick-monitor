export interface BlockId {
    hash: string,
    parts: {
        total: string,
        hash: string
    }
}
export interface Signature {
    block_id_flag: number,
    validator_address: string,
    timestamp: string,
    signature: string
}
export interface BlockData {
    block_id: BlockId,
    block: {
        header: {
            version: {
                block: string,
                app: string
            },
            chain_id: string,
            height: string,
            time: string
        },
        last_commit: {
            height: string,
            round: string,
            block_id: BlockId,
            signatures: [Signature]
        }
    }
}
export enum SigningState {
    SIGNING,
    NOT_SIGNING
}
export type State = {
    signing: SigningState,
    processedHeight: number
}
