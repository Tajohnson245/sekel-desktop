# Playwright Guide

This guide covers the local workflow, CI differences, and best practices for writing stable, flake-free tests.

## 1. Local Workflow (Cheat Sheet)

| Goal | Command |
| :--- | :--- |
| **Run all tests (headless)** | `npx playwright test` |
| **Run all tests (headed)** | `npx playwright test --headed` |
| **Run a single test file** | `npx playwright test tests/example.spec.ts` |
| **Run a specific test case** | `npx playwright test -g "should login successfully"` |
| **Debug a test (GUI)** | `npx playwright test --debug` |
| **View last report** | `npx playwright show-report` |
| **Update snapshots** | `npx playwright test --update-snapshots` |

**Note**: Do **not** use `--headless` flag. Playwright runs headless by default. Use `--headed` when you want to see the browser.

---

## 2. Flake Reduction Checklist

Before pushing code, ask:

- [ ] **Are you using hard waits?** (`waitForTimeout(5000)`) -> **❌ STOP.** Use web-first assertions (`await expect(locator).toBeVisible()`).
- [ ] **Are selectors fragile?** (`div > div:nth-child(3)`) -> **❌ STOP.** Use user-facing locators (`getByRole`, `getByText`, `getByTestId`).
- [ ] **Are you handling loading states?** Ensure you wait for the specific element you interact with, not just "wait for 2 seconds".
- [ ] **Is the test independent?** Does it rely on state from a previous test? (It shouldn't).
- [ ] **Are you using the correct `await`?** Almost every Playwright action needs `await`.

---

## 4. Refactoring Examples

### Example 1: Replacing Hard Waits with Assertions

**❌ Before (Flaky)**
```typescript
await page.click('#submit-btn');
// Flaky! What if the API takes 2.1 seconds?
await page.waitForTimeout(2000); 
const message = await page.$eval('.success', el => el.textContent);
expect(message).toBe('Saved!');
```

**✅ After (Stable)**
```typescript
await page.getByRole('button', { name: 'Submit' }).click();
// Stable! Auto-retries until specific element is visible or times out
await expect(page.getByText('Saved!')).toBeVisible(); 
```

### Example 2: Robust vs. Fragile Locators

**❌ Before (Fragile)**
```typescript
// Breaks if CSS layout changes slightly
await page.click('div.container > div:nth-child(2) > button');
```

**✅ After (Robust)**
```typescript
// resilient to layout changes
await page.getByRole('button', { name: 'Delete Item' }).click();
// OR using Test ID for specific elements
await page.getByTestId('delete-item-btn').click();
```

### Example 3: Handling Async Loading

**❌ Before (Race Condition)**
```typescript
await page.goto('/dashboard');
// Might click before the data is actually loaded and actionable
await page.click('.profile-icon');
```

**✅ After (Explicit Wait)**
```typescript
await page.goto('/dashboard');
// Wait for a key element that indicates the page is ready
await expect(page.getByTestId('dashboard-content')).toBeVisible();
await page.getByTestId('profile-icon').click();
```
