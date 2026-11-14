// One place for anything that changes when the custom domain is bought.
export const SITE = {
  name: 'EditPro',
  // Canonical public origin; Firebase Hosting must have this custom domain connected.
  origin: 'https://editpro.site',
  tagline: 'Edit PDFs and photos on the go. Scan, convert, frame and more.',
  contactEmail: 'andereya8@gmail.com',
  // Digits only, with the country code and no plus sign: the Class Library's WhatsApp requests go here (wa.me format).
  whatsapp: '255777167369',
  // Firebase web app settings, from Firebase console > Project settings > Your apps > Web app. They are not secret (anyone can see them in
  // any Firebase site); the Firestore rules decide who can change anything. Leave apiKey empty to switch uploaded files off.
  firebase: { apiKey: 'AIzaSyAK4hhs2PJlS72a-fQYeo0TuDZr9lekodc', authDomain: 'editpro.site', projectId: 'editpro1', appId: '1:688212947039:web:639d069171d3bf126a6bea' },
};
export const abs = (path: string) => SITE.origin + path;
