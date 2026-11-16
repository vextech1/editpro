<script lang="ts">
  import { SITE } from '#lib/site.ts';
  import { pageMeta } from '#lib/seo.ts';
</script>
<svelte:head><title>{pageMeta['/terms'].title}</title><meta name="description" content={pageMeta['/terms'].description} /></svelte:head>
<article class="prose">
<h1>Terms of use</h1>
<p class="meta">Last updated: November 16, 2026</p>

<p>By using the EditPro website you agree to these terms. If you do not agree, please do not use the site.</p>

<h2>1. The website</h2>
<p>EditPro provides free tools to scan, convert, compress and edit documents and images in your browser. No account is needed.</p>

<h2>2. Your content</h2>
<p>Files you process with the tools remain yours and are processed on your device. If you choose to share a study document in the Class Library, you confirm that you have the right to share it publicly and that it does not contain private or unlawful material. You keep ownership and grant EditPro a non-exclusive permission to store, display and distribute that document as part of the public Library. You may delete your shared document or account using My account. We may remove a shared document that is reported or does not meet these terms.</p>

<h2>3. Acceptable use</h2>
<p>Do not use the site to break the law, to infringe other people’s rights, to attempt to disrupt or reverse engineer the service, or to process or share content you are not allowed to handle. Do not upload personal records, copyrighted material you lack permission to distribute, malware or misleading files.</p>

<h2>4. No warranty</h2>
<p>The site is provided “as is”. Conversions, compression, page detection and text recognition may contain errors, so please keep a copy of important originals and check the results. Files saved in My files live in your browser and can be lost if you clear site data, so download anything you cannot afford to lose. We do not promise that the site will always be available or error-free.</p>

<h2>5. Limit of liability</h2>
<p>To the extent the law allows, we are not liable for indirect or consequential losses, or for loss of data, arising from use of the site.</p>

<h2>6. Changes and ending</h2>
<p>We may update these terms or the site from time to time. If you keep using the site after a change, you accept the new terms. You may stop using the site at any time.</p>

<h2>7. Contact</h2>
<p>Questions: <strong>{SITE.contactEmail}</strong>. See also our <a href="/privacy">privacy policy</a>.</p>
</article>
