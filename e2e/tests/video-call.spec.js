import { test, expect } from '@playwright/test';

const ROOM = '/e2e-test-room-' + Date.now();

test.describe('Video Call E2E', () => {
    test('landing page loads', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('MeetSync')).toBeVisible();
    });

    test('lobby shows username input and join button', async ({ page }) => {
        await page.goto(ROOM);
        await expect(page.getByLabel('Your Name')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Join Meeting' })).toBeDisabled();
    });

    test('can join meeting as host', async ({ page }) => {
        await page.goto(ROOM);
        await page.getByLabel('Your Name').fill('Host');
        await page.getByRole('button', { name: 'Join Meeting' }).click();

        // Host joins immediately — should see meeting controls
        await expect(page.getByLabel('Meeting controls')).toBeVisible({ timeout: 10000 });
        // Should see "Waiting for others" since alone
        await expect(page.getByText('Waiting for others to join')).toBeVisible();
    });

    test('second user enters waiting room', async ({ browser }) => {
        const hostContext = await browser.newContext({
            permissions: ['camera', 'microphone'],
        });
        const hostPage = await hostContext.newPage();
        await hostPage.goto(ROOM);
        await hostPage.getByLabel('Your Name').fill('Host');
        await hostPage.getByRole('button', { name: 'Join Meeting' }).click();
        await expect(hostPage.getByLabel('Meeting controls')).toBeVisible({ timeout: 10000 });

        // Second user joins
        const guestContext = await browser.newContext({
            permissions: ['camera', 'microphone'],
        });
        const guestPage = await guestContext.newPage();
        await guestPage.goto(ROOM);
        await guestPage.getByLabel('Your Name').fill('Guest');
        await guestPage.getByRole('button', { name: 'Join Meeting' }).click();

        // Guest should see waiting screen
        await expect(guestPage.getByText('Waiting for the host')).toBeVisible({ timeout: 10000 });

        await hostContext.close();
        await guestContext.close();
    });

    test('keyboard shortcut M toggles mute', async ({ page }) => {
        await page.goto(ROOM);
        await page.getByLabel('Your Name').fill('KeyboardUser');
        await page.getByRole('button', { name: 'Join Meeting' }).click();
        await expect(page.getByLabel('Meeting controls')).toBeVisible({ timeout: 10000 });

        // Press M to mute
        await page.keyboard.press('m');
        await expect(page.getByLabel('Unmute microphone')).toBeVisible();

        // Press M again to unmute
        await page.keyboard.press('m');
        await expect(page.getByLabel('Mute microphone')).toBeVisible();
    });

    test('keyboard shortcut C opens chat', async ({ page }) => {
        await page.goto(ROOM);
        await page.getByLabel('Your Name').fill('ChatUser');
        await page.getByRole('button', { name: 'Join Meeting' }).click();
        await expect(page.getByLabel('Meeting controls')).toBeVisible({ timeout: 10000 });

        // Press C to open chat
        await page.keyboard.press('c');
        await expect(page.getByText('In-Meeting Chat')).toBeVisible();
        await expect(page.getByText('No messages yet')).toBeVisible();
    });
});
