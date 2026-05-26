import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
    createCategory,
    deleteCategory,
    getCategories,
    updateCategory
} from '../../../services/category.service';
import type { Category, CategoryPayload } from '../../../services/category.service';
import { canManageCatalog } from '../../../utils/auth';

type FormState = {
    name: string;
    description: string;
};

const emptyForm: FormState = {
    name: '',
    description: ''
};

export default function CategoryManagement() {
    const canModify = canManageCatalog();
    const [categories, setCategories] = useState<Category[]>([]);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [form, setForm] = useState<FormState>(emptyForm);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadCategories = async (): Promise<void> => {
        setLoading(true);
        setError(null);

        try {
            setCategories(await getCategories());
        } catch {
            setError('Unable to load categories.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadCategories();
    }, []);

    const resetForm = (): void => {
        setEditingCategory(null);
        setForm(emptyForm);
    };

    const handleEdit = (category: Category): void => {
        setEditingCategory(category);
        setForm({
            name: category.name,
            description: category.description ?? ''
        });
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
        event.preventDefault();

        const payload: CategoryPayload = {
            name: form.name,
            description: form.description
        };

        setSubmitting(true);
        setError(null);

        try {
            if (editingCategory) {
                await updateCategory(editingCategory.id, payload);
            } else {
                await createCategory(payload);
            }

            resetForm();
            await loadCategories();
        } catch {
            setError('Unable to save category.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (category: Category): Promise<void> => {
        if (!confirm(`Delete category "${category.name}"?`)) {
            return;
        }

        setError(null);

        try {
            await deleteCategory(category.id);
            await loadCategories();
        } catch {
            setError('Unable to delete category.');
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-semibold text-stone-950">Categories</h1>
                <p className="mt-1 text-sm text-stone-600">Manage product categories.</p>
            </div>

            {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            {canModify ? (
                <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-stone-200 bg-white p-4">
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-1">
                            <span className="text-sm font-medium text-stone-700">Name</span>
                            <input
                                value={form.name}
                                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                                required
                                className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-stone-900"
                            />
                        </label>
                        <label className="space-y-1">
                            <span className="text-sm font-medium text-stone-700">Description</span>
                            <input
                                value={form.description}
                                onChange={(event) =>
                                    setForm((current) => ({ ...current, description: event.target.value }))
                                }
                                className="w-full rounded-md border border-stone-300 px-3 py-2 outline-none focus:border-stone-900"
                            />
                        </label>
                    </div>
                    <div className="flex justify-end gap-2">
                        {editingCategory ? (
                            <button
                                type="button"
                                onClick={resetForm}
                                className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100"
                            >
                                Cancel
                            </button>
                        ) : null}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white disabled:bg-stone-400"
                        >
                            {submitting ? 'Saving...' : editingCategory ? 'Update category' : 'Create category'}
                        </button>
                    </div>
                </form>
            ) : null}

            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="bg-stone-100 text-stone-700">
                        <tr>
                            <th className="px-4 py-3 font-semibold">Name</th>
                            <th className="px-4 py-3 font-semibold">Description</th>
                            {canModify ? <th className="px-4 py-3 text-right font-semibold">Actions</th> : null}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-200">
                        {loading ? (
                            <tr>
                                <td colSpan={canModify ? 3 : 2} className="px-4 py-6 text-center text-stone-500">
                                    Loading categories...
                                </td>
                            </tr>
                        ) : categories.length === 0 ? (
                            <tr>
                                <td colSpan={canModify ? 3 : 2} className="px-4 py-6 text-center text-stone-500">
                                    No categories found.
                                </td>
                            </tr>
                        ) : (
                            categories.map((category) => (
                                <tr key={category.id}>
                                    <td className="px-4 py-3 font-medium text-stone-950">{category.name}</td>
                                    <td className="px-4 py-3 text-stone-600">{category.description ?? '-'}</td>
                                    {canModify ? (
                                        <td className="px-4 py-3">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleEdit(category)}
                                                    className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium hover:bg-stone-100"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleDelete(category)}
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
