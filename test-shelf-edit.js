import { chromium } from 'playwright';

(async () => {
  console.log("Starting test...");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set viewport to a typical desktop size
  await page.setViewportSize({ width: 1280, height: 800 });
  
  await page.goto('http://localhost:5173');
  
  // Wait for the books to load
  await page.waitForTimeout(2000);
  
  // Switch to Library (Shelf) View if not already there
  const viewToggle = await page.$('.view-toggle-btn:not(.active)');
  if (viewToggle) {
      await viewToggle.click();
      await page.waitForTimeout(1000);
  }
  
  // Now we should be in Shelf view
  const books = await page.$$('.book-container');
  console.log(`Found ${books.length} books in shelf view.`);
  
  if (books.length > 0) {
      // Click the first book to expand it
      console.log("Clicking book spine to expand...");
      await books[0].click();
      await page.waitForTimeout(1000); // wait for animation
      
      // Click the Edit button
      console.log("Clicking Edit button...");
      const editBtn = await books[0].$('.library-book-footer button:has-text("Edit")');
      if (editBtn) {
          // Handle the alert dialog
          page.on('dialog', async dialog => {
              console.log(`DIALOG: ${dialog.message()}`);
              await dialog.accept();
          });
          
          await editBtn.click();
          await page.waitForTimeout(1000); // wait for modal to render
          
          // Take a screenshot of the whole page
          await page.screenshot({ path: 'edit_modal_test.png' });
          console.log("Screenshot saved as edit_modal_test.png");
      } else {
          console.log("Edit button not found on expanded book!");
      }
  } else {
      console.log("No books found on shelf.");
  }
  
  await browser.close();
})();
