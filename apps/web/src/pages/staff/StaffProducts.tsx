import { useEffect, useState } from 'react';
import ProductCard from '../../components/products/ProductCard';
import { getCategories, type Category } from '../../services/category.service';
import { getProducts, type Product } from '../../services/product.service';

export default function StaffProducts() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-stone-950">Staff Products</h1>
                <p className="mt-1 text-sm text-stone-600">
                    View products and categories. Total categories: {categories.length}
                </p>
            </div>

            {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            {loading ? (
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-10 text-center text-stone-500">
                    Loading products...
                </div>
            ) : products.length === 0 ? (
                <div className="rounded-lg border border-stone-200 bg-white px-4 py-10 text-center text-stone-500">
                    No products found.
                </div>
            ) : (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            )}
        </div>
    );
}
