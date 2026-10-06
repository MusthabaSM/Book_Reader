import { chromium } from 'playwright';

(async () => {
  console.log("Starting test...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  
  // Wait for the Library (Shelf) view books to load
  console.log("Waiting for shelf books to load...");
  await page.waitForSelector('.bookshelf-system .book-container', { timeout: 10000 });
  
  const books = await page.$$('.bookshelf-system .book-container');
  console.log(`Found ${books.length} books on the shelf.`);
  
  if (books.length > 0) {
    // Click the first book to expand it
    console.log("Clicking the first book to expand it...");
    await books[0].click();
    
    // Wait for the animation to finish
    await page.waitForTimeout(1000);
    
    // Click the Edit button on the first book
    console.log("Clicking the Edit button...");
    const editBtn = await books[0].$('.library-book-footer button:has-text("Edit")');
    if (editBtn) {
        
        // Let's add a listener for dialogs (alerts)
        page.on('dialog', async dialog => {
            console.log(`DIALOG RECEIVED: ${dialog.message()}`);
            await dialog.accept();
        });

        await editBtn.click();
        console.log("Edit button clicked via Playwright.");
        
        // Wait to see if the alert fires or the modal appears
        await page.waitForTimeout(1000);
        
        const isEditing = await page.$('.library-edit-form');
        console.log(`Is Edit Modal visible? ${isEditing ? 'YES' : 'NO'}`);
    } else {
        console.log("Edit button not found.");
    }
  }

  await browser.close();
})();
