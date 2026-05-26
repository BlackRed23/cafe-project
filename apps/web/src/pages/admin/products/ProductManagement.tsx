import { useEffect, useState } from 'react';
import ProductForm from '../../../components/products/ProductForm';
import { getCategories } from '../../../services/category.service';
import {
    createProduct,
    deleteProduct,
    getProducts,
    updateProduct
} from '../../../services/product.service';
import type { Category } from '../../../services/category.service';
import type { Product, ProductPayload } from '../../../services/product.service';
import { canManageCatalog } from '../../../utils/auth';

export default function ProductManagement() {
    const canModify = canManageCatalog();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadData = async (): Promise<void> => {
        setLoading(true);
        setError(null);

        try {
            const [productData, categoryData] = await Promise.all([getProducts(), getCategories()]);

            setProducts(productData);
            setCategories(categoryData);
        } catch {
            setError('Unable to load products.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const handleSubmit = async (payload: ProductPayload): Promise<void> => {
        setSubmitting(true);
        setError(null);

        try {
            if (editingProduct) {
                await updateProduct(editingProduct.id, payload);
                setEditingProduct(null);
            } else {
                await createProduct(payload);
            }

            await loadData();
        } catch {
            setError('Unable to save product.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (product: Product): Promise<void> => {
        if (!confirm(`Delete product "${product.name}"?`)) {
            return;
        }

        setError(null);

        try {
            await deleteProduct(product.id);
            await loadData();
        } catch {
            setError('Unable to delete product.');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-stone-950">Products</h1>
                <p className="mt-1 text-sm text-stone-600">Manage cafe products and images.</p>
            </div>

            {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            {canModify ? (
                <ProductForm
                    categories={categories}
                    product={editingProduct}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                    onCancel={editingProduct ? () => setEditingProduct(null) : undefined}
                />
            ) : null}

            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-stone-100 text-stone-700">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Image</th>
                            <th className="px-4 py-3 font-semibold">Name</th>
                            <th className="px-4 py-3 font-semibold">Category</th>
                            <th className="px-4 py-3 font-semibold">Price</th>
                            {canModify ? <th className="px-4 py-3 text-right font-semibold">Actions</th> : null}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                        {loading ? (
                            <tr>
                                <td colSpan={canModify ? 5 : 4} className="px-4 py-6 text-center text-stone-500">
                                    Loading products...
                                </td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan={canModify ? 5 : 4} className="px-4 py-6 text-center text-stone-500">
                                    No products found.
                                </td>
                            </tr>
                        ) : (
                            products.map((product) => (
                                <tr key={product.id}>
                                    <td className="px-4 py-3">
                                        <div className="h-14 w-14 overflow-hidden rounded-md bg-stone-100">
                                            {product.imageUrl ? (
                                                <img
                                                    src={product.imageUrl}
                                                    alt={product.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : null}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium text-stone-950">{product.name}</div>
                                        <div className="line-clamp-1 text-stone-500">{product.description ?? ''}</div>
                                    </td>
                                    <td className="px-4 py-3 text-stone-600">{product.category?.name ?? '-'}</td>
                                    <td className="px-4 py-3 text-stone-600">
                                        {product.price.toLocaleString('vi-VN')} VND
                                    </td>
                                    {canModify ? (
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setEditingProduct(product)}
                                                    className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDelete(product)}
                                                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    ) : null}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
