import React from 'react';
import { TableSkeleton } from './Skeleton';

interface Column<T> {
    header: string | React.ReactNode;
    accessor: keyof T | ((item: T) => React.ReactNode);
    className?: string;
}

interface TableProps<T> {
    data: T[];
    columns: Column<T>[];
    isLoading?: boolean;
    onRowClick?: (item: T) => void;
    emptyMessage?: string;
}

export const Table = <T extends { id: string }>({
    data,
    columns,
    isLoading,
    onRowClick,
    emptyMessage = "No records found"
}: TableProps<T>) => {
    if (isLoading) return <TableSkeleton />;

    if (data.length === 0) {
        return (
            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-12 text-center text-slate-500">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-900 text-slate-400 font-medium border-b border-slate-800">
                    <tr>
                        {columns.map((col, i) => (
                            <th key={i} className={`px-6 py-4 ${col.className}`}>
                                {col.header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950">
                    {data.map((item) => (
                        <tr
                            key={item.id}
                            onClick={() => onRowClick?.(item)}
                            className={`hover:bg-slate-900 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                        >
                            {columns.map((col, i) => (
                                <td key={i} className={`px-6 py-4 ${col.className}`}>
                                    {typeof col.accessor === 'function' ? col.accessor(item) : (item[col.accessor] as React.ReactNode)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
