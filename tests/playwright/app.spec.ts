import { test, expect, type Page } from '@playwright/test';
import { installTauriMock } from './tauri-mock';

async function connectSampleSqlite(page: Page, name = 'Playwright SQLite') {
  await page.getByTestId('toolbar-connect-btn').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  await dialog.getByRole('tab', { name: /sqlite/i }).click();
  await dialog.getByLabel(/connection name|ชื่อการเชื่อมต่อ/i).fill(name);
  await dialog.getByLabel(/database path|ที่อยู่ไฟล์ฐานข้อมูล/i).fill('/tmp/pw-test.db');

  await dialog.getByRole('button', { name: /^save$|^บันทึก$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId(`tree-node-${name}`)).toBeVisible();
}

test.describe('DataCore Real-Browser E2E', () => {
  let consoleErrors: string[];
  let pageErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await installTauriMock(page);
    await page.goto('/');
  });

  test.afterEach(() => {
    expect(pageErrors, `Uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(consoleErrors, `Console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('1. renders main shell, switches themes and languages without errors', async ({ page }) => {
    await expect(page.getByText('DataCore')).toBeVisible();
    await expect(page.getByTestId('toolbar-connect-btn')).toBeVisible();

    // Switch language EN <-> TH
    const langBtn = page.getByTestId('toolbar-language-btn');
    const initialLangText = (await langBtn.textContent())?.trim();
    await langBtn.click();
    await expect(langBtn).not.toHaveText(initialLangText || '');
    await langBtn.click();

    // Switch themes: dark -> light -> warm-paper -> dark
    const themeBtn = page.getByTestId('toolbar-theme-btn');
    await themeBtn.click();
    await page.getByTestId('theme-option-light').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    await themeBtn.click();
    await page.getByTestId('theme-option-warm-paper').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm-paper');

    await themeBtn.click();
    await page.getByTestId('theme-option-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });

  test('2. creates SQLite connection, browses schema tree, formats & executes SQL, and opens table data', async ({ page }) => {
    await connectSampleSqlite(page);

    // Expand main -> Tables -> users
    await page.getByTestId('tree-node-main').click();
    await page.getByTestId('tree-node-Tables (2)').click();
    const usersNode = page.getByTestId('tree-node-users');
    await expect(usersNode).toBeVisible();

    // Type SQL into CodeMirror editor, format, toggle split, and run
    const editor = page.locator('.cm-content').first();
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('select id, name from users;');

    await page.getByTestId('format-sql-btn').click();
    await page.getByTestId('toggle-split-btn').click();
    await page.getByTestId('toggle-split-btn').click();

    await page.getByRole('button', { name: /run query|รันคิวรี|^run$|รัน/i }).click();
    await expect(page.getByTestId('data-grid-container')).toBeVisible();
    await expect(page.getByText(/2 rows|2 แถว/i).first()).toBeVisible();
    await expect(page.getByTestId('split-resizer')).toBeVisible();

    // Double-click users table to open Table tab
    await usersNode.dblclick();
    await expect(page.getByRole('tab', { name: /users/i })).toBeVisible();
    await expect(page.getByTestId('data-grid-container')).toBeVisible();
  });

  test('3. saves query, prevents duplicate name, and opens Saved Queries tab', async ({ page }) => {
    await connectSampleSqlite(page);

    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('SELECT * FROM users;');

    // Save query
    await page.getByTestId('save-query-btn').click();
    await expect(page.getByTestId('save-query-modal')).toBeVisible();
    await page.getByTestId('save-query-title-input').fill('Active Users');
    await page.getByTestId('save-query-submit-btn').click();
    await expect(page.getByTestId('save-query-modal')).toBeHidden();

    // Verify duplicate name detection when opening a second query tab
    await page.getByTestId('add-query-tab-btn').click();
    const editor2 = page.locator('.cm-content').first();
    await editor2.click();
    await page.keyboard.type('SELECT id FROM users;');
    await page.getByTestId('save-query-btn').click();
    await page.getByTestId('save-query-title-input').fill('active users');
    await expect(page.getByTestId('save-query-duplicate-error')).toBeVisible();
    await expect(page.getByTestId('save-query-submit-btn')).toBeDisabled();
    await page.getByTestId('save-query-modal').getByRole('button', { name: /cancel|ยกเลิก/i }).click();
    await expect(page.getByTestId('save-query-modal')).toBeHidden();

    // Open Saved Queries management tab
    await page.getByTestId('toolbar-tools-btn').click();
    await page.getByTestId('toolbar-tools-saved-queries-btn').click();
    await expect(page.getByTestId('saved-queries-tab')).toBeVisible();
    await expect(page.getByText('Active Users').first()).toBeVisible();
  });

  test('4. switches TableListTab views (List, Grid, Grouped, Storage) and opens Table Structure Editor', async ({ page }) => {
    await connectSampleSqlite(page);

    await page.getByTestId('toolbar-table-btn').click();
    await expect(page.getByTestId('table-list-container')).toBeVisible();

    // Switch through all 4 view modes
    await page.getByTestId('view-mode-grid').click();
    await expect(page.getByTestId('table-list-grid-view')).toBeVisible();

    await page.getByTestId('view-mode-grouped').click();
    await expect(page.getByTestId('table-list-grouped-view')).toBeVisible();

    await page.getByTestId('view-mode-storage').click();
    await expect(page.getByTestId('table-list-storage-view')).toBeVisible();

    await page.getByTestId('view-mode-table').click();
    await page.getByTestId('toggle-group-in-list').click();
    await expect(page.getByTestId('table-list-grouped-list')).toBeVisible();
    await page.getByTestId('toggle-group-in-list').click();

    // Right-click users row -> Design Table
    await page.getByText('users').first().click({ button: 'right' });
    await expect(page.getByTestId('table-list-context-menu')).toBeVisible();
    await page.getByTestId('ctx-design-table').click();

    await expect(page.getByTestId('table-structure-editor')).toBeVisible();
    await page.getByTestId('tab-indexes-btn').click();
    await page.getByTestId('tab-ddl-btn').click();
  });

  test('5. opens Visual Query Builder, builds SQL preview, and executes query', async ({ page }) => {
    await connectSampleSqlite(page);

    await page.getByTestId('toolbar-tools-btn').click();
    await page.getByTestId('toolbar-tools-query-builder-btn').click();

    await expect(page.getByTestId('visual-query-builder-tab')).toBeVisible();
    await expect(page.getByTestId('qb-sql-preview')).toBeVisible();

    await page.getByTestId('qb-run-query-btn').click();
    await expect(page.getByTestId('qb-results-container')).toBeVisible();
  });

  test('6. manages tabs via context menu, pin/unpin, and Open Tabs Switcher', async ({ page }) => {
    await connectSampleSqlite(page);

    await page.getByTestId('add-query-tab-btn').click();
    await page.getByTestId('add-query-tab-btn').click();

    // Open Tabs Switcher
    await page.getByTestId('open-tabs-switcher-btn').click();
    await expect(page.getByTestId('open-tabs-switcher-menu')).toBeVisible();
    await page.keyboard.press('Escape');

    // Right-click first tab -> Pin Tab -> Close Others
    const firstTab = page.getByRole('tab').first();
    await firstTab.click({ button: 'right' });
    await expect(page.getByTestId('tab-context-menu')).toBeVisible();
    await page.getByTestId('ctx-tab-pin').click();

    await firstTab.click({ button: 'right' });
    await page.getByTestId('ctx-tab-close-others').click();
    await expect(page.getByRole('tab')).toHaveCount(1);
  });

  test('7. opens Tools Bento menu, Audit Log, History, Export dropdown, About modal, and Command Palette', async ({ page }) => {
    await connectSampleSqlite(page);

    // Tools Bento Menu -> Audit Log Drawer
    await page.getByTestId('toolbar-tools-btn').click();
    await expect(page.getByTestId('toolbar-tools-dropdown')).toBeVisible();
    await expect(page.getByTestId('toolbar-tools-bento-grid')).toBeVisible();
    await page.getByTestId('toolbar-tools-audit-btn').click();
    await page.getByRole('button', { name: /close audit log|ปิด/i }).click();

    // Tools -> About modal
    await page.getByTestId('toolbar-tools-btn').click();
    await page.getByTestId('toolbar-tools-about-btn').click();
    const aboutDialog = page.getByRole('dialog');
    await expect(aboutDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(aboutDialog).toBeHidden();

    // Export dropdown
    await page.getByTestId('toolbar-export-btn').click();
    await expect(page.getByTestId('toolbar-export-dropdown')).toBeVisible();
    await page.keyboard.press('Escape');

    // Command Palette (⌘K / Ctrl+K)
    const modKey = process.platform === 'darwin' ? 'Meta+k' : 'Control+k';
    await page.keyboard.press(modKey);
    const paletteDialog = page.getByRole('dialog');
    await expect(paletteDialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(paletteDialog).toBeHidden();
  });

  test('8. Design: opens Visual ER Diagram and tests all Table Structure Designer tabs', async ({ page }) => {
    await connectSampleSqlite(page);

    // Open Visual ER Diagram
    await page.getByTestId('toolbar-tools-btn').click();
    await page.getByTestId('toolbar-tools-er-diagram-btn').click();
    await expect(page.getByTestId('er-auto-layout')).toBeVisible();
    await page.getByTestId('er-zoom-in').click();
    await page.getByTestId('er-zoom-reset').click();

    // Open Table List -> Design Table -> test all 6 Designer tabs
    await page.getByTestId('toolbar-table-btn').click();
    await expect(page.getByTestId('table-list-container')).toBeVisible();
    await page.getByText('users').first().click({ button: 'right' });
    await page.getByTestId('ctx-design-table').click();

    await expect(page.getByTestId('table-structure-editor')).toBeVisible();
    await page.getByTestId('tab-columns-btn').click();
    await page.getByTestId('tab-indexes-btn').click();
    await page.getByTestId('tab-foreign-keys-btn').click();
    await page.getByTestId('tab-constraints-btn').click();
    await page.getByTestId('tab-security-btn').click();
    await expect(page.getByTestId('toggle-rls-btn')).toBeDisabled(); // RLS disabled for SQLite
    await page.getByTestId('tab-ddl-btn').click();
  });

  test('9. Design: verifies responsive layout, zero horizontal overflow, and sidebar collapse/expand', async ({ page }) => {
    await connectSampleSqlite(page);

    // Check zero horizontal overflow at desktop and narrower viewports
    for (const vp of [{ width: 1280, height: 800 }, { width: 960, height: 700 }]) {
      await page.setViewportSize(vp);
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasOverflow).toBe(false);
    }

    // Collapse & expand sidebar while keeping splitter accessible
    await expect(page.getByTestId('sidebar-splitter')).toHaveAttribute('role', 'separator');
    await page.getByRole('button', { name: /collapse sidebar|พับแถบข้าง/i }).click();
    await page.getByRole('button', { name: /expand sidebar|ขยายแถบข้าง/i }).click();
    await expect(page.getByTestId('sidebar-splitter')).toBeVisible();
  });

  test('10. Security: toggles Screen Sharing Protection, PII Masking, and inspects Connection Security modal', async ({ page }) => {
    await connectSampleSqlite(page);

    // Toggle Screen Sharing Protection (Privacy Mode)
    const privacyBtn = page.getByTestId('toolbar-screen-protection-btn');
    const initialPressed = await privacyBtn.getAttribute('aria-pressed');
    await privacyBtn.click();
    await expect(privacyBtn).toHaveAttribute('aria-pressed', initialPressed === 'true' ? 'false' : 'true');
    await privacyBtn.click();

    // Run query and toggle DataGrid PII Masking
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('SELECT id, name, email FROM users;');
    await page.getByRole('button', { name: /run query|รันคิวรี|^run$|รัน/i }).click();
    await expect(page.getByTestId('data-grid-container')).toBeVisible();

    const piiBtn = page.getByRole('button', { name: /reveal sensitive data|mask sensitive data/i });
    await expect(piiBtn).toBeVisible();
    await piiBtn.click();

    // Open Connection SSL & Security Modal
    await page.getByTestId('toolbar-tools-btn').click();
    await page.getByTestId('toolbar-tools-security-btn').click();
    const secDialog = page.getByRole('dialog', { name: /connection encryption and security status/i });
    await expect(secDialog).toBeVisible();
    await expect(secDialog.getByText(/AES-256-GCM/i)).toBeVisible();
    await secDialog.getByRole('button', { name: /^close$|^ปิด$/i }).last().click();
    await expect(secDialog).toBeHidden();
  });

  test('11. Security: enforces Production Safe Mode guardrail on dangerous SQL and verifies Audit Log chain', async ({ page }) => {
    // Create Production SQLite connection
    await page.getByTestId('toolbar-connect-btn').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('tab', { name: /sqlite/i }).click();
    await dialog.getByLabel(/connection name|ชื่อการเชื่อมต่อ/i).fill('Prod SQLite');
    await dialog.getByLabel(/database path|ที่อยู่ไฟล์ฐานข้อมูล/i).fill('/tmp/prod-test.db');
    await dialog.locator('select').filter({ has: page.locator('option[value="production"]') }).selectOption('production');
    await dialog.getByRole('button', { name: /^save$|^บันทึก$/i }).click();
    await expect(dialog).toBeHidden();

    // Attempt dangerous query (DROP TABLE) -> DangerousQueryConfirmModal must block & require confirmation
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('DROP TABLE users;');
    await page.getByRole('button', { name: /run query|รันคิวรี|^run$|รัน/i }).click();

    await expect(page.getByTestId('dangerous-query-overlay')).toBeVisible();
    await expect(page.getByTestId('production-safe-mode-banner')).toBeVisible();
    await expect(page.getByTestId('dangerous-query-confirm-btn')).toBeDisabled();
    await page.getByTestId('safe-mode-confirm-input').fill('CONFIRM');
    await expect(page.getByTestId('dangerous-query-confirm-btn')).toBeEnabled();
    await page.getByRole('alertdialog').getByRole('button', { name: /cancel|ยกเลิก/i }).click();
    await expect(page.getByTestId('dangerous-query-overlay')).toBeHidden();

    // Open Audit Log Drawer and run Verify Chain Integrity
    await page.getByTestId('toolbar-tools-btn').click();
    await page.getByTestId('toolbar-tools-audit-btn').click();
    await page.getByRole('button', { name: /verify chain integrity/i }).click();
    await page.getByRole('button', { name: /close audit log|ปิด/i }).click();
  });

  test('12. Security: prevents Stored XSS in DataGrid/Unicode/NULL values and handles SQLi filter input safely', async ({ page }) => {
    await installTauriMock(page, { xssAndSpecialRows: true });
    await page.goto('/');
    await connectSampleSqlite(page, 'XSS Check SQLite');

    // Run query returning XSS payloads, Unicode/Emoji, NULL, '', and 'NULL'
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type("SELECT * FROM users WHERE name = '<script>alert(1)</script>';");
    await page.getByRole('button', { name: /run query|รันคิวรี|^run$|รัน/i }).click();

    await expect(page.getByTestId('data-grid-container')).toBeVisible();
    await expect(page.getByText(/3 rows|3 แถว/i).first()).toBeVisible();

    // Ensure zero script execution occurred
    const xssTriggered = await page.evaluate(
      () => Boolean((window as unknown as Record<string, unknown>).__xssTriggered)
    );
    expect(xssTriggered).toBe(false);

    // Ensure SQLi payload in Object Browser filter does not crash UI
    const filterInput = page.getByPlaceholder(/filter objects/i);
    await filterInput.fill("' OR 1=1 --");
    await expect(filterInput).toHaveValue("' OR 1=1 --");
  });

  test('13. Security: masks connection password in DOM/localStorage and handles failed Test Connection cleanly', async ({ page }) => {
    await installTauriMock(page, { testConnectionError: 'Connection refused (ECONNREFUSED)' });
    await page.goto('/');

    await page.getByTestId('toolbar-connect-btn').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Switch to PostgreSQL to inspect host/port/password fields
    await dialog.getByRole('tab', { name: /postgresql|postgres/i }).click();
    await dialog.locator('#conn-name').fill('Bad PG');
    await dialog.locator('#conn-host').fill('192.0.2.1');
    await dialog.locator('#conn-port').fill('5432');
    await dialog.locator('#conn-database').fill('postgres');
    await dialog.locator('#conn-user').fill('postgres');

    const secret = 'super-secret-pw-123';
    const pwInput = dialog.locator('#conn-password');
    await expect(pwInput).toHaveAttribute('type', 'password');
    await pwInput.fill(secret);

    // Click Test Connection and verify readable error message appears
    await dialog.getByRole('button', { name: /test connection|ทดสอบการเชื่อมต่อ/i }).click();
    await expect(dialog.getByText(/connection refused/i)).toBeVisible();

    // Verify password is never leaked into localStorage
    const localStorageDump = await page.evaluate(() => JSON.stringify(window.localStorage));
    expect(localStorageDump).not.toContain(secret);
  });

  test('14. Security: prompts Vault Master Password unlock, rejects wrong password, and unlocks with valid password', async ({ page }) => {
    await installTauriMock(page, { vaultLocked: true });
    await page.goto('/');

    const vaultDialog = page.getByRole('dialog', { name: /unlock credential vault/i });
    await expect(vaultDialog).toBeVisible();

    // Wrong password shows error
    await vaultDialog.locator('#vault-unlock-password').fill('wrong-password');
    await vaultDialog.getByRole('button', { name: /unlock vault/i }).click();
    await expect(vaultDialog.getByText(/invalid master password/i)).toBeVisible();

    // Correct password unlocks and closes modal
    await vaultDialog.locator('#vault-unlock-password').fill('correct-master-pw');
    await vaultDialog.getByRole('button', { name: /unlock vault/i }).click();
    await expect(vaultDialog).toBeHidden();
  });

  test('15. Resilience: recovers cleanly after SQL/IPC error without losing editor state', async ({ page }) => {
    await installTauriMock(page, { failNextQueryError: 'syntax error near "FROMM"' });
    await page.goto('/');
    await connectSampleSqlite(page, 'Resilience SQLite');

    // First query fails with syntax/IPC error
    const editor = page.locator('.cm-content').first();
    await editor.click();
    await page.keyboard.type('SELECT * FROMM users;');
    await page.getByRole('button', { name: /run query|รันคิวรี|^run$|รัน/i }).click();

    await expect(page.getByTestId('toolbar-error-message')).toBeVisible();
    await expect(page.getByTestId('toolbar-error-message')).toContainText(/syntax error/i);

    // Second query succeeds and recovers cleanly
    await page.getByRole('button', { name: /run query|รันคิวรี|^run$|รัน/i }).click();
    await expect(page.getByTestId('data-grid-container')).toBeVisible();
    await expect(page.getByText(/2 rows|2 แถว/i).first()).toBeVisible();
  });
});
