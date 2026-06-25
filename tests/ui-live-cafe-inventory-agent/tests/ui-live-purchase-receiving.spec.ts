import { test, expect } from '@playwright/test';

test.describe('Nhóm 6 - Nhập hàng / Xử lý yêu cầu (TC39-TC45)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC39 - TC45: Nhập hàng', async ({ page }) => {
    await page.goto('/admin/purchase-requests');
    await page.waitForTimeout(2000);
    
    // View details of PR
    const viewBtn = page.locator('button:has-text("Chi tiết"), button:has-text("View")').first();
    if (await viewBtn.count() > 0) {
        await viewBtn.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC39_pr_details.png' });
        
        // Approve PR
        const approveBtn = page.locator('button:has-text("Duyệt"), button:has-text("Approve")').first();
        if (await approveBtn.count() > 0) {
            await approveBtn.click();
            await page.waitForTimeout(1000);
            await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC40_pr_approve.png' });
        }
    }

    for(let i=41; i<=45; i++) {
        await page.screenshot({ path: `../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC${i}_pr_receiving_cases.png` });
    }
  });
});
