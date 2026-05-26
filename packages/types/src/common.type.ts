export type ApiResponse<T> = {
  success: boolean;
  message: string;
  data: T;
};

export type ApiErrorResponse = ApiResponse<null>;
