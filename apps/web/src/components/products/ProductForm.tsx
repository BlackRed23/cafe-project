import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { Category } from '../../services/category.service';
import type { Product, ProductPayload } from '../../services/product.service';

type ProductFormProps = {
    categories: Category[];
    product?: Product | null;
    submitting?: boolean;
    onSubmit: (payload: ProductPayload) => Promise<void> | void;
    onCancel?: () => void;
};

type FormState = {
    name: string;
    description: string;
    price: string;
    categoryId: string;
    image: File | null;
};

const getInitialState = (product?: Product | null, categories: Category[] = []): FormState => ({
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product ? String(product.price) : '',
    categoryId: product?.categoryId ?? categories[0]?.id ?? '',
    image: null
});

export default function ProductForm({ categories, product, submitting = false, onSubmit, onCancel }: ProductFormProps) {
    const [form, setForm] = useState<FormState>(() => getInitialState(product, categories));
    const [previewUrl, setPreviewUrl] = useState<string | null>(product?.imageUrl ?? null);

    useEffect(() => {
        setForm(getInitialState(product, categories));
        setPreviewUrl(product?.imageUrl ?? null);
    }, [product, categories]);

    const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
        const { name, value } = event.target;

        setForm((current) => ({ ...current, [name]: value }));
    };

    const handleImageChange = (event: ChangeEvent<HTMLInputElement>): void => {
        const file = event.target.files?.[0] ?? null;

        setForm((current) => ({ ...current, image: file }));

        if (previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(previewUrl);
        }

        setPreviewUrl(file ? URL.createObjectURL(file) : product?.imageUrl ?? null);
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();

        await onSubmit({
            name: form.name,
            description: form.description,
            price: Number(form.price),
            categoryId: form.categoryId,
            image: form.image
        });

        if (!product) {
            setForm(getInitialState(null, categories));
            setPreviewUrl(null);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
            <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1">
                    <span className="text-sm font-medium text-stone-700">Name</span>
                    <input
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        required
                        className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-stone-900"
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-sm font-medium text-stone-700">Price</span>
                    <input
                        name="price"
                        type="number"
                        min="0"
                        step="1000"
                        value={form.price}
                        onChange={handleChange}
                        required
                        className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-stone-900"
                    />
                </label>
            </div>
            <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">Category</span>
                <select
                    name="categoryId"
                    value={form.categoryId}
                    onChange={handleChange}
                    required
                    className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-stone-900"
                >
                    <option value="" disabled>
                        Select category
                    </option>
                    {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                            {category.name}
                        </option>
                    ))}
                </select>
            </label>
            <label className="space-y-1">
                <span className="text-sm font-medium text-stone-700">Description</span>
                <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-stone-900"
                />
            </label>
            <div className="grid gap-4 md:grid-cols-[160px_1fr]">
                <div className="aspect-square overflow-hidden rounded-md bg-stone-100">
                    {previewUrl ? (
                        <img src={previewUrl} alt="Product preview" className="h-full w-full object-cover" />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-stone-500">Preview</div>
                    )}
                </div>
                <label className="space-y-1">
                    <span className="text-sm font-medium text-stone-700">Image</span>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="w-full rounded-md border border-stone-300 px-3 py-2 text-sm"
                    />
                </label>
            </div>
            <div className="flex justify-end gap-2">
                {onCancel ? (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100"
                    >
                        Cancel
                    </button>
                ) : null}
                <button
                    type="submit"
                    disabled={submitting || categories.length === 0}
                    className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                    {submitting ? 'Saving...' : product ? 'Update product' : 'Create product'}
                </button>
            </div>
        </form>
    );
}
