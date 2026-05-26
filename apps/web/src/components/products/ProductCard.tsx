import type { Product } from '../../services/product.service';

type ProductCardProps = {
    product: Product;
};

export default function ProductCard({ product }: ProductCardProps) {
    return (
        <article className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <div className="aspect-[4/3] bg-stone-100">
                {product.imageUrl ? (
                    <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                    <div className="flex h-full items-center justify-center text-sm text-stone-500">No image</div>
                )}
            </div>
            <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-stone-950">{product.name}</h3>
                    <p className="shrink-0 text-sm font-semibold text-emerald-700">
                        {product.price.toLocaleString('vi-VN')} VND
                    </p>
                </div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                    {product.category?.name ?? 'Uncategorized'}
                </p>
                {product.description ? <p className="text-sm leading-6 text-stone-600">{product.description}</p> : null}
            </div>
        </article>
    );
}
