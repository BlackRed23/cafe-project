import { apiClient, unwrapApiField } from "./client";

export const uploadApi = {
  uploadImage: async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append("image", file);

    const response = await apiClient.post("/upload/product-image", formData);
    return unwrapApiField<string>(response.data, "imageUrl");
  },
};
