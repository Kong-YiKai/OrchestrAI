import asyncio
import uuid
from datetime import datetime, timezone

from models.workflow import Workflow, WorkflowNode, NodeStatus, NodeResult, ExecutionMethod
from socket_manager import sio
from config import settings


class NodeExecutor:
    def __init__(self, session_id: str):
        self.session_id = session_id

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
