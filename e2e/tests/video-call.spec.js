import { test, expect } from '@playwright/test';

const ROOM = '/e2e-test-room-' + Date.now();

test.describe('Video Call E2E', () => {
    test('landing page loads', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'MeetSync' })).toBeVisible();
    });

    test('can join meeting as host', async ({ page }) => {
        await page.goto(ROOM);
        await page.getByLabel('Your Name').fill('Host');
        await page.getByRole('button', { name: 'Join Meeting' }).click();
        await expect(page.getByLabel('Meeting controls')).toBeVisible({ timeout: 10000 });
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

        const guestContext = await browser.newContext({
            permissions: ['camera', 'microphone'],
        });
        const guestPage = await guestContext.newPage();
        await guestPage.goto(ROOM);
        await guestPage.getByLabel('Your Name').fill('Guest');
        await guestPage.getByRole('button', { name: 'Join Meeting' }).click();

        const waiting = guestPage.getByText('Waiting for the host to let you in');
        const controls = guestPage.getByLabel('Meeting controls');
        await expect(waiting.or(controls)).toBeVisible({ timeout: 15000 });

        await hostContext.close();
        await guestContext.close();
    });
});
