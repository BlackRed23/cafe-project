import { useEffect, useMemo, useState } from 'react';
import ProductCard from '../../components/products/ProductCard';
import { getCategories, type Category } from '../../services/category.service';
import { getProducts, type Product } from '../../services/product.service';

export default function ProductList() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [categoryId, setCategoryId] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
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

        void loadData();
    }, []);

    const filteredProducts = useMemo(() => {
        if (!categoryId) {
            return products;
        }

        return products.filter((product) => product.categoryId === categoryId);
    }, [products, categoryId]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                <div>
                    <h1 className="text-3xl font-semibold text-stone-950">Products</h1>
                    <p className="mt-2 max-w-2xl text-stone-600">Browse available cafe drinks and food.</p>
                </div>
                <label className="w-full space-y-1 md:w-64">
                    <span className="text-sm font-medium text-stone-700">Category</span>
                    <select
                        value={categoryId}
                        onChange={(event) => setCategoryId(event.target.value)}
                        className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 outline-none focus:border-stone-900"
                    >
                        <option value="">All categories</option>
                        {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                                {category.name}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            {loading ? (
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-10 text-center text-stone-500">
                    Loading products...
                </div>
            ) : filteredProducts.length === 0 ? (
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-10 text-center text-stone-500">
                    No products found.
                </div>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredProducts.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </div>
    );
}
