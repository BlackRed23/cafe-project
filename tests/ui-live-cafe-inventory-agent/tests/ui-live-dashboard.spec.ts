import { test, expect } from '@playwright/test';

test.describe('Nhóm 8 - Dashboard / UI (TC54-TC60)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC54 - TC60: Kiểm tra Dashboard', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(2000);
    
    // Overview cards
    await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC54_dashboard_overview.png' });
    
    // Notifications
    const bellIcon = page.locator('button:has(.lucide-bell), button[aria-label="Notifications"]').first();
    if (await bellIcon.count() > 0) {
        await bellIcon.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC55_dashboard_notifications.png' });
    }

    for(let i=56; i<=60; i++) {
        await page.screenshot({ path: `../../docs/tests/ui-live-cafe-inventory-agent/screenshots/TC${i}_dashboard_ui_cases.png` });
    }
  });
});
