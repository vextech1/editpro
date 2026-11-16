<script lang="ts">
  import { SITE } from '#lib/site.ts';
  import { pageMeta } from '#lib/seo.ts';
</script>
<svelte:head><title>{pageMeta['/terms'].title}</title><meta name="description" content={pageMeta['/terms'].description} /></svelte:head>
<article class="prose">
<h1>Terms of use</h1>
<p class="meta">Last updated: November 17, 2026</p>

<p>By using the EditPro website you agree to these terms. If you do not agree, please do not use the site.</p>

<h2>1. The website</h2>
<p>EditPro provides free tools to scan, convert, compress and edit documents and images in your browser. No account is needed to use the tools. The Class Library, a collection of study documents, has its own rules in section 7.</p>

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

<h2>7. The Class Library and shared documents</h2>
<p><strong>How downloads work.</strong> Anyone can browse the Library. Your first download on a device is free. After that you sign in with Google and share one study document: each live document you share unlocks 3 more downloads. We may change these numbers, and we may take back downloads that were unlocked by a document that was removed. The Library’s files are shared for study; they come with no promise that they are accurate, complete or up to date.</p>
<p><strong>Who may share.</strong> Accounts and uploads are for people aged 13 and older. You may share only study material that is your own work, or that you have permission to share. Do not share anything that is copyrighted by someone else without permission (such as pages from a textbook), that is private or confidential, that contains other people’s personal information, that is harmful, unlawful or not suitable for students, or that is not study material. Do not try to earn downloads with duplicate, empty or junk documents.</p>
<p><strong>What you allow.</strong> You keep the rights in what you share. By sharing a document you give EditPro a free, non-exclusive licence to store it, show it and let other students download it through the Library for as long as it is listed. You promise that you have the right to give this licence. You can delete your documents, or your whole account, at any time in Settings, My account. Deleting a document ends the licence for that copy, though copies other students have already downloaded stay with them.</p>
<p><strong>Checking and removal.</strong> We may check shared documents and may remove any document, at any time and without notice beforehand, if it appears to break these terms or someone’s rights. When we remove one, its file is deleted and you will see a message with the reason in My account; the downloads it unlocked are taken back. We may refuse or close the account of someone who repeatedly shares documents that break these terms.</p>
<p><strong>Reporting a document.</strong> If you believe a document infringes your rights or breaks these terms, use the “Report” link next to it, or write to <strong>{SITE.contactEmail}</strong> with the document’s title, what is wrong and, if it copies your work, who you are and where the original is. We will look at it promptly and remove the document if the report is justified.</p>

<h2>8. Contact</h2>
<p>Questions: <strong>{SITE.contactEmail}</strong>. See also our <a href="/privacy">privacy policy</a>.</p>
</article>
