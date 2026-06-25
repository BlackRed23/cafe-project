import { test as setup, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const authFile = path.join(__dirname, '../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('http://localhost:5173/login');
  
  // Try finding email input
  await page.getByPlaceholder(/name@domain/i).fill('admin@cafe.com');
  await page.getByPlaceholder(/•••/i).fill('123456');
  await page.getByRole('main').getByRole('button', { name: /đăng nhập|login/i }).click();

  // Wait until the URL changes to home or admin dashboard
  await page.waitForURL(/.*(admin|dashboard|\/)/);
  
  // Expect some text to confirm login
  await expect(page.getByText(/Quản lý|admin|dashboard/i).first()).toBeVisible({ timeout: 10000 });

  await page.context().storageState({ path: authFile });
});
