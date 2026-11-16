<svelte:head><title>{pageMeta['/privacy'].title}</title><meta name="description" content={pageMeta['/privacy'].description} /></svelte:head>
<article class="prose">
<h1>Privacy policy</h1>
<p class="meta">Last updated: November 16, 2026</p>

<p>This policy covers the EditPro website and its free tools. Files chosen in the tools are processed in your browser on your own device unless you choose to share a study document in the public Class Library. The site uses no cookies, analytics or advertising.</p>

<h2>1. Who we are</h2>
<p>EditPro is developed by Vextech. Questions or requests: <strong>{SITE.contactEmail}</strong>.</p>

<h2>2. Your files stay on your device</h2>
<p>Photos, scans, PDFs and the text recognized from them are processed by your browser. They are not sent to our servers or to anyone else. When you download a result, it is saved by your browser, and what you do with it afterwards is up to you.</p>

<h2>3. What we collect</h2>
<p>You do not need an account to use the tools, browse the Library or make your first Library download on a device. To download additional files through the site, you can sign in with Google and share study documents. Google Firebase Authentication handles sign-in. We store the account identifier, the files and details you choose to share, their Library status, and records of downloads unlocked by your shared documents. Student-shared files are published in the public Library and can be downloaded by anyone. You can delete your shared files or request deletion of your account and its associated records from My account. The Library administrator also uses Google sign-in to manage the catalog. Google Firebase Hosting may keep standard server logs (such as IP address, pages requested and browser type) for security and service operation. If you email us, we keep your message and address so that we can reply.</p>

<h2>4. The camera</h2>
<p>The “Scan documents” tool asks your browser for permission to use your camera. The picture stays in your browser: nothing is recorded or sent anywhere. You can decline and add photos from your device instead, and you can withdraw permission at any time in your browser’s site settings.</p>

<h2>5. Saved files (My files)</h2>
<p>If you tap “Save” on a result, a copy is stored in your browser’s own storage (IndexedDB) on this device, under “My files”. It is never uploaded to us or anyone else. So that you can search inside saved PDFs and text files, the words in them are also read on your device and kept in the same browser storage; this text is removed whenever the file is deleted. Scanned PDFs without a text layer can only be found by name. You can rename or delete saved files at any time, deleted files are removed for good after 30 days in the trash, and clearing this site’s data in your browser removes everything.</p>

<h2>6. Library</h2>
<p>The Library at /class-library reads its public catalog and downloadable files from Firebase Firestore. Everyone can browse, and the first download remembered by a browser is free. Further downloads through the site require Google sign-in and credits earned by sharing study documents; each live shared document earns three downloads. Student uploads are limited to 5 MB and, once published, are public. The download allowance is a website feature, not a technical restriction on direct access to public files. You can remove your own shared documents or delete your account from My account. The administrator also signs in with Google to manage the catalog and review student uploads. If a file is missing, the request buttons open WhatsApp or your email app with a message already written; the message is handled under that provider’s own policy.</p>

<h2>7. Offline use and text recognition</h2>
<p>The site uses a service worker to keep its own pages and scripts in your browser so that most tools work offline. The “Extract text” tool reads your images on your device. The first time you use it, your browser downloads the text engine and the data for your chosen language from this website (the same host as the page), then keeps them for next time. No third-party server is contacted, and your images and the text found in them are never sent anywhere.</p>

<h2>8. Who we share information with</h2>
<p>We do not sell personal information. Google provides hosting, authentication and Firestore storage for public Library materials and student account data. Student-shared documents and their catalog details are available to Library visitors. Google may process related service data in countries other than yours. See <a href="https://firebase.google.com/support/privacy">Firebase privacy information</a>.</p>

<h2>9. Your choices and rights</h2>
<p>You can review or delete your shared documents and delete your account from <a href="/settings/account">My account</a>. Depending on where you live, you may also have rights to access, correct or delete personal information, or object to some processing. Contact the address above for requests about data that cannot be managed on the site.</p>

<h2>10. Children</h2>
<p>EditPro is not directed to children under 13, and we do not knowingly collect their personal information. If you believe a child has sent us information, contact us and we will delete it.</p>

<h2>11. Security</h2>
<p>The site is served over HTTPS. Files used only in the browser-based tools stay on your device. Documents you choose to share are stored in Firebase and made public in the Library. No method of storage or transfer is perfectly secure, but we take reasonable care.</p>

<h2>12. Changes</h2>
<p>If we change this policy, we will update the date above. If we add features that collect more information, such as analytics or ads, we will update this page before they go live.</p>
</article>

<script lang="ts">
  import { SITE } from '#lib/site.ts';
  import { pageMeta } from '#lib/seo.ts';
</script>
