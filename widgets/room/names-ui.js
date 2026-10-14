// The two helpers the page needs (the page runs in the renderer, which cannot require main-side modules).
export const initials = (name) => String(name).split('-').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
export const hueOf = (name) => { let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
