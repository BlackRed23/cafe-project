export class AgentHttpError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string
    ) {
        super(message);
        this.name = 'AgentHttpError';
    }
}
