// Extra page text for each tool: when to use it, and answers to common questions.
// Kept apart from tools.ts so the tool list stays small. Shown on /tools/<slug>.
export interface ToolContent {
  uses: string[];
  faq: [question: string, answer: string][];
}

export const toolContent: Record<string, ToolContent> = {
  'scan-document': {
    uses: [
      'Turn receipts, forms and contracts into clean PDFs without a scanner.',
      'Capture a multi-page document by adding more pages before you create the PDF.',
      'Digitise notes, printed pages and handouts so you can keep or share them.'
    ],
    faq: [
      ['How do I get a sharp scan?', 'Lay the page on a surface that contrasts with it, such as a dark desk for white paper. Use good light and avoid shadows. Check that the yellow outline sits on the page corners, and drag it if it does not.'],
      ['Can I scan several pages into one PDF?', 'Yes. Add more pages after the first one, then create a single PDF.'],
      ['Do I have to use the camera?', 'No. You can scan with the camera or add photos you have already taken.']
    ]
  },
  'compress-image': {
    uses: [
      'Make photos small enough to email or upload to a form.',
      'Free up storage by shrinking a whole batch of photos at once.',
      'Reduce the longest side so pictures load quickly on a web page.'
    ],
    faq: [
      ['Why does the quality slider not change my PNG?', 'PNG is lossless, so the quality slider has no effect on PNG output. Changing a PNG to JPG or WebP with the Convert images tool usually gives a much smaller file.'],
      ['Can I compress more than one photo at a time?', 'Yes. Choose one or more photos, set the quality and longest side, then download each result.'],
      ['What makes the file smaller?', 'Lower quality and a smaller longest side both reduce file size. Shrinking the longest side usually saves the most.']
    ]
  },
  'convert-image': {
    uses: [
      'Change a PNG to JPG when a site or form only accepts JPG.',
      'Save photos as WebP for smaller files on websites.',
      'Convert a batch of pictures to one format in a single go.'
    ],
    faq: [
      ['Which formats can I convert between?', 'JPG, PNG and WebP. You can convert from any of them to any other.'],
      ['Why did my transparent background turn white?', 'JPG cannot store transparency, so transparent areas turn white when you save as JPG. Choose PNG or WebP to keep them see-through.'],
      ['Can I convert many images at once?', 'Yes. Choose one or more images, pick the format, then download each result.']
    ]
  },
  'images-to-pdf': {
    uses: [
      'Combine photos of a document into one PDF to send as a single file.',
      'Put receipts, certificates or ID pictures into one tidy PDF.',
      'Make a simple photo album or portfolio PDF in the order you choose.'
    ],
    faq: [
      ['How do I set the page order?', 'Use the ▲ and ▼ buttons next to each picture to move it up or down before you create the PDF.'],
      ['Can I choose the page size?', 'Yes. Pick a page size before you create the PDF. Each picture goes on its own page.'],
      ['Do I need to scan the pages first?', 'No. Any photos or images work. If you want to straighten and clean paper pages, use Scan documents first.']
    ]
  },
  'merge-pdf': {
    uses: [
      'Join several reports, chapters or invoices into one PDF.',
      'Combine a cover letter, CV and certificates into a single application file.',
      'Put scanned pages from different sessions back into one document.'
    ],
    faq: [
      ['Why can’t I merge my PDF?', 'Password-protected or damaged files can’t be merged. Remove the password in your PDF app first, then try again.'],
      ['Can I change the order of the files?', 'Yes. Use the ▲ and ▼ buttons to set the order before you merge.'],
      ['What do I get at the end?', 'Choose two or more PDF files and you get one merged PDF to download.']
    ]
  },
  'organize-pdf': {
    uses: [
      'Delete blank or unwanted pages from a PDF.',
      'Reorder, reverse or rotate pages, including whole-document rotation.',
      'Fix a double-sided scan where the pages came out in the wrong order, or pull selected pages into a new file.'
    ],
    faq: [
      ['Can I see the pages before I change them?', 'Yes. Every page is shown as a preview so you can rotate, move or remove it.'],
      ['How do I extract only some pages?', 'Tick the pages you want and choose to extract them. You get a new PDF with just those pages.'],
      ['Why can’t I open my PDF?', 'Password-protected PDFs can’t be edited yet. Remove the password in your PDF app first.']
    ]
  },
  'split-pdf': {
    uses: [
      'Pull a few pages out of a long PDF to share.',
      'Break a big document into chapters or sections.',
      'Save every page as its own file.'
    ],
    faq: [
      ['How do I split by page range?', 'Type ranges such as 1-3, 5 and the tool makes a file for each range. Or choose every page to get one file per page.'],
      ['Can I download all the pieces at once?', 'Yes. Download each file on its own, or take all of them as a ZIP.'],
      ['Does splitting change the pages?', 'No. The pages are copied as they are into the new files.']
    ]
  },
  'pdf-to-images': {
    uses: [
      'Turn PDF pages into JPG or PNG pictures to post or insert in slides.',
      'Save one page of a PDF as a picture for a chat or an email.',
      'Create a picture of every page for a gallery or a preview.'
    ],
    faq: [
      ['JPG or PNG: which should I pick?', 'JPG makes smaller files and suits photos. PNG keeps text and sharp lines crisp and is better for pages with lots of text.'],
      ['Why does it stall on a long PDF?', 'Long PDFs at high resolution use a lot of memory. If it stalls, pick a lower resolution.'],
      ['How do I get all the pictures?', 'Download the pictures as a ZIP.']
    ]
  },
  'compress-pdf': {
    uses: [
      'Shrink a PDF to meet an email attachment or upload limit.',
      'Make scanned PDFs smaller so they are easier to store.',
      'Convert a PDF to grayscale to save space and ink when printing.'
    ],
    faq: [
      ['Will I still be able to select the text?', 'By default, yes. Text stays selectable. The “Maximum” and “Convert to grayscale” options turn pages into pictures, so text can no longer be selected.'],
      ['What if the file can’t be made smaller?', 'The original is kept and you are told, so you never end up with a larger file by mistake. The grayscale option is the exception: a grayscale copy is always made, even if it is not smaller.'],
      ['Can I compress several PDFs at once?', 'Yes. Choose up to 20 PDFs, pick how much to shrink them, then download each result.']
    ]
  },
  'pdf-to-docx': {
    uses: [
      'Edit the text of a PDF in Word when you no longer have the original file.',
      'Reuse paragraphs, headings and bullet lists from a PDF report.',
      'Turn a PDF made from a Word document back into an editable Word file.'
    ],
    faq: [
      ['What gets converted?', 'Headings, paragraphs, bullet lists, and bold or italic text. It works best on PDFs made from Word or other documents.'],
      ['What does not get converted?', 'Tables, columns and complex layouts are not rebuilt, and pictures inside a page are left out.'],
      ['What about scanned PDFs?', 'Pages with no text, such as scans, can be kept as a picture, or you can use Extract text (OCR) to read them. Password-protected PDFs can’t be converted.']
    ]
  },
  'extract-images': {
    uses: [
      'Save the original photos or logos stored inside a PDF.',
      'Collect all the pictures from a brochure or report in one ZIP.',
      'Reuse artwork from a PDF without taking screenshots.'
    ],
    faq: [
      ['Is the picture quality reduced?', 'No. JPEG pictures are copied out exactly, with no quality loss.'],
      ['How is this different from PDF to images?', 'This saves the pictures stored inside the PDF. PDF to images makes a picture of each whole page.'],
      ['Why are some images skipped?', 'A few kinds, such as scanned fax pages and spot-colour artwork, can’t be extracted and are counted as skipped. Pictures drawn as vector shapes are not pictures, so they won’t appear. You can also skip tiny images such as icons and lines.']
    ]
  },
  'watermark-pdf': {
    uses: [
      'Mark a document DRAFT, CONFIDENTIAL or SAMPLE across every page.',
      'Put a company logo on each page of a PDF.',
      'Show who a copy was prepared for before you send it.'
    ],
    faq: [
      ['Can I control how the watermark looks?', 'Yes. Set the size, angle and see-through level. It is drawn on top of the page, made see-through so the page stays readable.'],
      ['Can I use a logo instead of text?', 'Yes. Type your text, or choose a picture such as a logo.'],
      ['Can someone remove the watermark?', 'Anyone can edit or remove it with PDF editing software, so it discourages copying but does not prevent it.']
    ]
  },
  'page-numbers': {
    uses: [
      'Number the pages of a report, thesis or contract.',
      'Add a header or footer with a title, date or file name.',
      'Add Bates numbers to documents for legal or filing work.'
    ],
    faq: [
      ['Can I write my own text?', 'Yes. Pick a ready-made style, or type your own text for any of the six spots on the page.'],
      ['Which placeholders can I use?', 'Use {n} for the page number, {total} for the last number, {date} for today’s date, {file} for the file name and {bates} for a Bates number.'],
      ['Can I number only some pages?', 'Yes. Choose which pages to include before you add the text.']
    ]
  },
  'crop-pdf': {
    uses: [
      'Trim wide margins so the content fills the page.',
      'Scale pages to fit A4, Letter or another paper size for printing.',
      'Remove scanner borders from every page at once.'
    ],
    faq: [
      ['Does cropping erase the cropped area?', 'No. Trimming hides the cropped area but it is not erased from the file, so do not use it to hide private information. To remove content for good, use a redaction tool.'],
      ['Can I crop only some pages?', 'Yes. You can pick which pages to change before you download the result.'],
      ['Can I change the paper size?', 'Yes. Scale pages to fit A4, Letter and other paper sizes.']
    ]
  },
  'pdf-metadata': {
    uses: [
      'Set a proper title and author before you share a PDF.',
      'Remove hidden author and software details before you send a file.',
      'Check what information is stored inside a PDF.'
    ],
    faq: [
      ['What is PDF metadata?', 'It is the hidden information stored in a file, such as the title, author, subject, keywords and which software made it.'],
      ['Does removing metadata change the pages?', 'No. Removing it does not change the pages you see.'],
      ['How do I remove everything?', 'Tick Remove all metadata, then save and download the PDF.']
    ]
  },
  'pdf-to-text': {
    uses: [
      'Copy the text of a PDF into an email, note or document.',
      'Get Markdown with headings and lists to paste into notes or a website.',
      'Search or process the text of a long report in another program.'
    ],
    faq: [
      ['Plain text or Markdown?', 'Plain text is just the words. Markdown keeps headings, lists, bold and italic, which is useful for notes and web pages.'],
      ['Why is my text empty?', 'This works on PDFs that contain real text. Scanned pages have no text to read, so use Extract text (OCR) for those.'],
      ['Why is the order of text wrong?', 'Tables and multi-column pages may come out in the wrong order, because the reading order depends on how the PDF was made.']
    ]
  },
  'extract-text': {
    uses: [
      'Copy text from a photo of a page, sign or whiteboard.',
      'Read the text in a scanned PDF so you can search or edit it.',
      'Save the recognised text as a .txt file.'
    ],
    faq: [
      ['How do I get the best result?', 'Clear, well-lit, straight-on photos give the best results.'],
      ['Can I choose the language?', 'Yes. Pick the language of the text before you extract.'],
      ['How many PDF pages can it read?', 'PDFs are read up to 20 pages.']
    ]
  },
  'edit-image': {
    uses: [
      'Crop and straighten a photo before you share it.',
      'Adjust brightness, contrast and colour to fix a dull picture.',
      'Use Clean document to brighten scans and receipts.'
    ],
    faq: [
      ['What can I change?', 'Crop, rotate, flip, and adjust brightness, contrast and colour.'],
      ['What is Clean document?', 'An adjustment meant for scans and receipts, to make them easier to read.']
    ]
  },
  'resize-image': {
    uses: [
      'Make a passport, visa or ID photo the right size.',
      'Meet a form’s file-size or pixel limit.',
      'Fit a photo to a print size or a social media post, with an optional print sheet PDF for copies.'
    ],
    faq: [
      ['Are the passport sizes always correct?', 'Passport, visa, ID and form sizes differ between countries and offices, and they change. Always check the official instructions for your application. The tool asks you to confirm the size each time.'],
      ['Can I type my own size?', 'Yes. Pick a ready-made size, or type your own.'],
      ['Can I resize many photos?', 'Yes. Choose your photos, position each one, pick a format and resize.']
    ]
  },
  'photo-frames': {
    uses: [
      'Show a photo in a wall frame with a mat.',
      'Put a screenshot inside a phone for an app preview or a post.',
      'Make a photo look finished for a gift or a listing.'
    ],
    faq: [
      ['What frames are available?', 'Wall frames with a mat and phone frames. Pick the style you like, then download.'],
      ['How do I keep a transparent background?', 'Choose PNG. It keeps the background transparent.'],
      ['Which formats can I download?', 'PNG, JPG or WebP.']
    ]
  },
  'collage-images': {
    uses: [
      'Put several photos into one picture for a post or a message.',
      'Make before and after comparisons side by side.',
      'Combine pictures from a trip or event into a grid.'
    ],
    faq: [
      ['How many photos can I use?', 'Up to 12 photos at a time.'],
      ['What layouts are there?', 'A grid, side by side or stacked. You can reorder the photos and set the spacing and colour.'],
      ['Which formats can I download?', 'JPG, PNG or WebP.']
    ]
  },
  'round-image': {
    uses: [
      'Crop a photo to a circle for a profile picture.',
      'Round the corners of an icon or logo.',
      'Make a rounded avatar to use on a website or in an app.'
    ],
    faq: [
      ['How do I keep the corners see-through?', 'Save as PNG to keep see-through corners. JPG fills them with a colour.'],
      ['What shapes can I choose?', 'Circle, rounded square or another shape, with a roundness setting.'],
      ['Can I move the photo inside the shape?', 'Yes. Move the photo inside the shape until it looks right, then download.']
    ]
  },
  'redact-image': {
    uses: [
      'Hide faces, number plates or addresses before you post a photo.',
      'Cover personal details on a screenshot or a document photo.',
      'Blur or pixelate a part of a picture you want to keep private.'
    ],
    faq: [
      ['Which hiding method is safest?', 'A black box or strong pixelation is safest. A light blur can sometimes be reversed.'],
      ['Can I cover more than one area?', 'Yes. Drag as many boxes as you need over what you want to cover.'],
      ['How do I know it worked?', 'Download the picture and check the saved copy to make sure what you wanted hidden is covered.']
    ]
  },
  'annotate-image': {
    uses: [
      'Add captions or labels to a photo or screenshot.',
      'Point at something with an arrow or circle it with an oval.',
      'Sketch freehand notes on a picture.'
    ],
    faq: [
      ['What can I add?', 'Text, arrows, boxes, ovals and freehand drawing, in colours and sizes you choose.'],
      ['Can I undo a mistake?', 'Yes. Use Undo to remove the last mark.'],
      ['Which formats can I download?', 'JPG, PNG or WebP.']
    ]
  },
  'color-picker': {
    uses: [
      'Find the exact colour of something in a photo.',
      'Get HEX, RGB and HSL values to use in design or code.',
      'Build a small palette from the main colours of a picture.'
    ],
    faq: [
      ['Which colour formats do I get?', 'HEX, RGB and HSL. Copy the one you need.'],
      ['Does it show the main colours of a photo?', 'Yes. It shows the six main colours of the picture, and you can keep picked colours to build a palette.'],
      ['Are the colours exact?', 'Colours are read from the picture as shown on your screen.']
    ]
  },
  'watermark-image': {
    uses: [
      'Add your name or a copyright line to photos before you share them.',
      'Put a logo on a whole batch of pictures.',
      'Repeat a watermark across a picture to make copying harder.'
    ],
    faq: [
      ['Can I watermark many photos at once?', 'Yes. Add the watermark to one photo or a whole batch, then download them, or all of them as a ZIP.'],
      ['Can I control the placement?', 'Choose a corner or repeat it across the picture, then set the size and how see-through it is.'],
      ['Can a watermark be removed?', 'A watermark is drawn into the picture. Someone determined can still crop or edit it out.']
    ]
  }
};

// Asked on every tool page.
export const sharedFaq: [string, string][] = [
  ['Is it free, and do I need an account?', 'It is free to use and there is no sign-up. It works in your browser on your phone, tablet or computer.']
];
