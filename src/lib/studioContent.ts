// Extra page text for each studio: what it is, how it works, and answers to common questions.
// Shown below the studio on /studio/<id>. Kept apart from workspaces.ts so that file stays about behaviour.
// Only say what the studios really do (see docs/WORKSPACE_PLAN.md); the tool list itself comes from the tool registry.
export interface StudioContent {
  about: string[];
  steps: string[];
  faq: [question: string, answer: string][];
}

export const studioContent: Record<string, StudioContent> = {
  image: {
    about: [
      'Photo Studio is a free online photo editor that runs in your browser. Open a picture once, then crop, resize, mark up, frame and compress it without choosing the file again between steps.',
      'Every change is kept as a version, so you can undo, redo or go back to the original. Your pictures stay on your device and are never uploaded.'
    ],
    steps: [
      'Open a picture from your phone or computer.',
      'Choose a tool for the next step, such as edit, resize, watermark or compress.',
      'Apply it, keep editing with another tool or step back with Undo, then download the result or save it to My files.'
    ],
    faq: [
      ['Are my photos uploaded anywhere?', 'No. Photos are processed in your browser on your own device, and nothing is sent to a server. There is no sign-up.'],
      ['Can I undo a change?', 'Yes. Each result is kept as a version, so you can undo, redo or return to the original while the work is kept on this device.'],
      ['Which kinds of picture can I open?', 'Common picture formats such as JPG, PNG and WebP. You can also convert between them.'],
      ['How long is my work kept?', 'Open work stays on this device for the number of days chosen in Settings, or until you delete it. Pin it to keep it longer. Clearing your browser’s site data removes it, so download anything you can’t lose.']
    ]
  },
  document: {
    about: [
      'Document Studio is a free online PDF editor and document scanner that runs in your browser. Open a PDF or a picture once, then organize pages, merge, split, compress, add page numbers or a watermark, scan, extract text and convert, without choosing the file again between steps.',
      'Every result is kept as a version, so you can undo and redo. Your documents are processed on your own device and are never uploaded.'
    ],
    steps: [
      'Open a PDF or a picture, or start with the scanner or Images to PDF, which need no file.',
      'Choose a tool for the next step, such as organize, compress, watermark or extract text.',
      'Apply it, keep editing with another tool, then download the result or save it to My files.'
    ],
    faq: [
      ['Are my documents uploaded anywhere?', 'No. PDFs, scans and pictures are processed in your browser on your own device, and nothing is sent to a server. There is no sign-up.'],
      ['Can I scan paper with my phone?', 'Yes. Use the scanner to take photos of pages with your camera, check the page corners, and save the pages as one PDF.'],
      ['Can I turn a PDF into Word or text?', 'Yes. PDF to Word makes an editable .docx file, and PDF to text gives plain text or Markdown. To read text from a scan or a photo, use Extract text (OCR).'],
      ['Can it open password-protected PDFs?', 'Not yet. Remove the password in your PDF app first, then try again.']
    ]
  }
};
