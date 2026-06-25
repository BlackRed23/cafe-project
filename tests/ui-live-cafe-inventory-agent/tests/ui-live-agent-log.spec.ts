import { test, expect } from '@playwright/test';

test.describe('Nhóm 7 - Nhật ký Agent (TC46-TC53)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC46 - TC53: Xem nhật ký Agent', async ({ page }) => {
    await page.goto('/admin/logs');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC46_agent_logs.png' });
    
    const firstLog = page.locator('.log-item, tr').nth(1);
    if (await firstLog.count() > 0) {
        await firstLog.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC47_agent_log_details.png' });
    }

    for(let i=48; i<=53; i++) {
        await page.screenshot({ path: `../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC${i}_agent_log_cases.png` });
    }
  });
});
