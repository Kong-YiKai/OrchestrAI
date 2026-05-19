import asyncio
import uuid
from datetime import datetime, timezone

from models.workflow import Workflow, WorkflowNode, NodeStatus, NodeResult, ExecutionMethod
from socket_manager import sio
from config import settings
from services.execution_control import execution_control


# Mock-mode timings. Kept small so tests stay fast; UI still feels like something
# is happening because each node goes through queued → running → several logs →
# complete. Tunable in one place if the demo feels too snappy or too sluggish.
MOCK_LOG_DELAY = 0.25       # seconds between log lines for a single node
MOCK_BETWEEN_NODES = 0.10   # seconds of breathing room between nodes


class NodeExecutor:
    def __init__(self, session_id: str, mock: bool = False):
        self.session_id = session_id
        # When mock=True we skip all real API/Playwright/Claude work and just
        # emit a realistic-looking event sequence. This is what the Run button
        # on /workflows/[id] uses for demos, so the canvas can be exercised
        # without external API keys.
        self.mock = mock

    async def _log(self, node_id: str, line: str):
        await sio.emit(
            "execution:node_log",
            {"node_id": node_id, "log_line": line},
            room=self.session_id,
        )

    async def execute_workflow(self, workflow: Workflow):
        for node in sorted(workflow.nodes, key=lambda n: n.order):
            await self.execute_node(node, workflow.workflow_id)

    async def execute_node(self, node: WorkflowNode, workflow_id: str):
        await sio.emit(
            "execution:node_started",
            {"node_id": node.node_id, "workflow_id": workflow_id},
            room=self.session_id,
        )

        # Mock branch: emit a staged, deterministic event sequence without
        # touching any external service. Used by the canvas Run button for
        # demos and by tests to assert the event contract.
        if self.mock:
            await self._execute_node_mock(node)
            return

        result: NodeResult | None = None
        method: ExecutionMethod | None = None

        # Strategy 1: Direct API call (for api tool_type)
        if node.tool_type.value == "api":
            await self._log(node.node_id, f"🔌 Attempting direct API call to {node.assigned_tool}...")
            try:
                result = await self._api_execute(node)
                method = ExecutionMethod.api
                await self._log(node.node_id, "✅ API call succeeded.")
            except Exception as e:
                await self._log(node.node_id, f"⚠️ API call failed: {e}. Falling back to browser automation...")

        # Strategy 2: Playwright browser automation
        if result is None and node.tool_type.value in ("web_automation", "api"):
            await self._log(node.node_id, f"🌐 Starting browser automation for {node.assigned_tool}...")
            try:
                result = await self._playwright_execute(node)
                method = ExecutionMethod.playwright
                await self._log(node.node_id, "✅ Browser automation succeeded.")
            except Exception as e:
                await self._log(node.node_id, f"⚠️ Browser automation failed: {e}. Using AI simulation...")

        # Strategy 3: Claude simulates a realistic result (demo fallback)
        if result is None:
            await self._log(node.node_id, "🤖 Generating simulated result with Claude...")
            try:
                result = await self._simulate_with_claude(node)
                method = ExecutionMethod.simulated
                await self._log(node.node_id, "✅ Simulation complete.")
            except Exception as e:
                await sio.emit(
                    "execution:node_error",
                    {"node_id": node.node_id, "error": str(e)},
                    room=self.session_id,
                )
                return

        await sio.emit(
            "execution:node_complete",
            {
                "node_id": node.node_id,
                "result": result.model_dump(),
                "execution_method": method.value if method else "simulated",
            },
            room=self.session_id,
        )

    async def _execute_node_mock(self, node: WorkflowNode):
        """Emit a realistic queued → running → complete sequence without any
        real API calls. Stages are tailored to the node's tool_type so demos
        look plausible, but no secrets or network are required.
        """
        tool = node.assigned_tool or node.assigned_ai or "tool"
        ai = node.assigned_ai or "claude"

        if node.tool_type.value == "api":
            stages = [
                f"🔌 Calling {tool} API...",
                "📥 Received response (200 OK).",
                "✅ Parsed payload successfully.",
            ]
            method = ExecutionMethod.api
        elif node.tool_type.value == "web_automation":
            stages = [
                f"🌐 Launching browser for {tool}...",
                "🧭 Navigating and locating target element...",
                "📋 Extracted result from page.",
            ]
            method = ExecutionMethod.playwright
        else:  # llm / code / anything else
            stages = [
                f"🤖 {ai} picking up the task...",
                "🧠 Thinking through the step...",
                "✅ Draft result ready.",
            ]
            method = ExecutionMethod.simulated

        for line in stages:
            if execution_control.is_node_cancelled(self.session_id, node.node_id):
                await self._stop_node(node)
                return
            await self._log(node.node_id, line)
            await asyncio.sleep(MOCK_LOG_DELAY)

        title_en = node.title or node.title_zh or "Step"
        title_zh = node.title_zh or node.title or "步骤"
        result = NodeResult(
            raw={"mock": True, "tool": tool, "ai": ai},
            summary=f"{title_en} completed successfully (mock).",
            summary_zh=f"{title_zh} 已完成（模拟执行）。",
        )

        # Persist on the in-memory node so the Workflow we later save reflects
        # the mock run — mirrors what the real strategies do.
        node.status = NodeStatus.complete
        node.result = result
        node.execution_method = method

        await sio.emit(
            "execution:node_complete",
            {
                "node_id": node.node_id,
                "result": result.model_dump(),
                "execution_method": method.value,
            },
            room=self.session_id,
        )
        await asyncio.sleep(MOCK_BETWEEN_NODES)

    async def _stop_node(self, node: WorkflowNode):
        execution_control.clear_node_cancel(self.session_id, node.node_id)
        node.status = NodeStatus.idle
        node.error = "Stopped by user."
        await sio.emit(
            "execution:node_stopped",
            {"node_id": node.node_id, "reason": "user_requested"},
            room=self.session_id,
        )

    async def _api_execute(self, node: WorkflowNode) -> NodeResult:
        """Try a direct API call based on known tool registry."""
        tool = node.assigned_tool.lower()

        if "openweathermap" in tool or "weather" in tool:
            return await self._call_openweathermap(node)
        elif "news" in tool:
            return await self._call_news_api(node)
        else:
            raise ValueError(f"No registered API handler for: {node.assigned_tool}")

    async def _call_openweathermap(self, node: WorkflowNode) -> NodeResult:
        import httpx
        # Use free endpoint without key for demo
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://wttr.in/Beijing?format=j1",
                timeout=10,
            )
            r.raise_for_status()
            data = r.json()
            temp = data["current_condition"][0]["temp_C"]
            desc = data["current_condition"][0]["weatherDesc"][0]["value"]
            return NodeResult(
                raw={"temperature_c": temp, "description": desc},
                summary=f"Weather: {temp}°C, {desc}",
                summary_zh=f"天气：{temp}°C，{desc}",
            )

    async def _call_news_api(self, node: WorkflowNode) -> NodeResult:
        # Placeholder for news API
        raise ValueError("News API requires key")

    async def _playwright_execute(self, node: WorkflowNode) -> NodeResult:
        """Use Playwright to automate a web tool."""
        from browser.pool import BrowserPool
        import anthropic

        # Ask Claude to generate a Playwright script for this node
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": f"""Write a Playwright Python async function body (no imports, no function def) that:
1. Navigates to the relevant website for: {node.assigned_tool}
2. Performs the task: {node.description}
3. Extracts the result as a string stored in variable `result_text`

Keep it simple. Use `page` as the page variable. Max 15 lines.""",
                }
            ],
        )
        script = response.content[0].text

        pool = await BrowserPool.get_instance()
        browser = await pool.acquire()
        result_text = ""
        try:
            page = await browser.new_page()
            # Execute the generated script in a controlled namespace
            namespace = {"page": page, "result_text": ""}
            exec_code = f"import asyncio\nasync def _run(page):\n"
            for line in script.split("\n"):
                exec_code += f"    {line}\n"
            exec_code += "    return locals().get('result_text', '')\n"
            exec(compile(exec_code, "<string>", "exec"), namespace)
            result_text = await namespace["_run"](page)
            await page.close()
        finally:
            await pool.release(browser)

        return NodeResult(
            raw={"output": result_text},
            summary=result_text[:200] if result_text else "Task completed via browser automation",
            summary_zh=result_text[:200] if result_text else "已通过浏览器自动化完成任务",
        )

    async def _simulate_with_claude(self, node: WorkflowNode) -> NodeResult:
        """Ask Claude to generate a realistic-looking result for demo purposes."""
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[
                {
                    "role": "user",
                    "content": f"""You are simulating the output of an AI workflow step for a demo.
Step: {node.title}
Description: {node.description}
Tool: {node.assigned_tool}

Generate a realistic, specific, and impressive-looking result for this step.
Respond with JSON: {{"summary": "<English 1-2 sentence result>", "summary_zh": "<Chinese translation>", "raw": {{<relevant key-value pairs>}}}}
Only output the JSON, nothing else.""",
                }
            ],
        )

        import json
        try:
            data = json.loads(response.content[0].text)
            return NodeResult(
                raw=data.get("raw", {}),
                summary=data.get("summary", "Step completed successfully."),
                summary_zh=data.get("summary_zh", "步骤执行成功。"),
            )
        except Exception:
            return NodeResult(
                raw={},
                summary=f"{node.title} completed successfully.",
                summary_zh=f"{node.title_zh} 执行完成。",
            )
