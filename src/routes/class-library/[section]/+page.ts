export const prerender = false;
export function load({ params }: { params: { section: string } }) { return { section: params.section }; }
