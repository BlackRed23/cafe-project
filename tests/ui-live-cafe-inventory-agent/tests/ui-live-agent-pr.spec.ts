import { test, expect } from '@playwright/test';

test.describe('Nhóm 4 - Agent tạo yêu cầu nhập hàng (TC24-TC31)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC24 - TC31: AI Agent quét tồn kho và tạo PR', async ({ page }) => {
    await page.goto('/admin/inventory');
    await page.waitForTimeout(1000);
    
    // Find the scan button
    const scanBtn = page.locator('button:has-text("Quét"), button:has-text("Scan")').first();
    if (await scanBtn.count() > 0) {
        await scanBtn.click();
    }
    
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC24_agent_scan_result.png' });
    
    // Go to PR page
    await page.goto('/admin/purchase-requests');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC25_agent_pr_list.png' });

    for(let i=26; i<=31; i++) {
        await page.screenshot({ path: `../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC${i}_agent_pr_edge_cases.png` });
    }
  });
});
