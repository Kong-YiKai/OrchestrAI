import asyncio
from playwright.async_api import async_playwright, Browser, Playwright


class BrowserPool:
    _instance: "BrowserPool | None" = None
    MAX_BROWSERS = 3

    def __init__(self):
        self._playwright: Playwright | None = None
        self._semaphore = asyncio.Semaphore(self.MAX_BROWSERS)
        self._browsers: list[Browser] = []

    async def _init(self):
        self._playwright = await async_playwright().start()

    async def acquire(self) -> Browser:
        await self._semaphore.acquire()
        browser = await self._playwright.chromium.launch(headless=True)
        self._browsers.append(browser)
        return browser

    async def release(self, browser: Browser):
        try:
            await browser.close()
        except Exception:
            pass
        if browser in self._browsers:
            self._browsers.remove(browser)
        self._semaphore.release()

    @classmethod
    async def get_instance(cls) -> "BrowserPool":
        if cls._instance is None:
            pool = BrowserPool()
            await pool._init()
            cls._instance = pool
        return cls._instance
