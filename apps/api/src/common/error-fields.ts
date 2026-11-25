export const errorField = (error: unknown, key: string): unknown => {
    if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return undefined;
    return (error as Record<string, unknown>)[key];
};

export const errorMessage = (error: unknown): string | undefined => {
    const message = errorField(error, 'message');
    return typeof message === 'string' ? message : undefined;
};

export const errorStatus = (error: unknown, key: 'status' | 'statusCode'): number | undefined => {
    const status = errorField(error, key);
    return typeof status === 'number' ? status : undefined;
};
