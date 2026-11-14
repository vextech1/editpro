import { pageMeta } from '#lib/seo.ts';

export const prerender = true;

export function load() { return { meta: pageMeta['/class-library'] }; }
