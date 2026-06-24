'use client';

import { useEffect, useState } from 'react';

let cachedRole: string | null = null;

export function useAdminRole() {
    const [role, setRole] = useState<string | null>(cachedRole);

    useEffect(() => {
        if (cachedRole) return;
        fetch('/api/user/profile')
            .then(res => res.json())
            .then(data => {
                cachedRole = data.role || null;
                setRole(cachedRole);
            })
            .catch(() => {});
    }, []);

    return {
        role,
        isAdmin: role === 'ADMIN' || role === 'CURATOR',
    };
}
