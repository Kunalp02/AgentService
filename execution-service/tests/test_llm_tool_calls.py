from agent_execution.infrastructure.llm_gateway import BifrostLlmGateway


def test_openai_tool_call_is_parsed():
    result = BifrostLlmGateway._extract_result(
        {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "calculate_dog_years",
                                    "arguments": "{\"human_years\": 7}",
                                },
                            }
                        ],
                    }
                }
            ]
        }
    )
    assert result.tool_calls[0].name == "calculate_dog_years"
    assert result.tool_calls[0].arguments == {"human_years": 7}


def test_top_level_tool_name_is_parsed():
    result = BifrostLlmGateway._extract_result(
        {
            "choices": [
                {
                    "message": {
                        "content": "",
                        "tool_calls": [
                            {
                                "name": "calculate_dog_years",
                                "arguments": {"human_years": 3},
                            }
                        ],
                    }
                }
            ]
        }
    )
    assert result.tool_calls[0].name == "calculate_dog_years"
    assert result.tool_calls[0].arguments == {"human_years": 3}


def test_harmony_channel_tool_call_is_parsed():
    content = (
        "<|channel|>commentary to=functions.calculate_dog_years "
        '<|constrain|>json<|message|>{"human_years": 5}<|call|>'
    )
    result = BifrostLlmGateway._extract_result(
        {"choices": [{"message": {"content": content}}]}
    )
    assert result.tool_calls[0].name == "calculate_dog_years"
    assert result.tool_calls[0].arguments == {"human_years": 5}
    assert result.content == ""


def test_xml_tool_call_is_parsed():
    content = (
        '<tool_call>{"name":"calculate_dog_years","arguments":{"human_years":2}}</tool_call>'
    )
    result = BifrostLlmGateway._extract_result(
        {"choices": [{"message": {"content": content}}]}
    )
    assert result.tool_calls[0].name == "calculate_dog_years"
    assert result.tool_calls[0].arguments == {"human_years": 2}


def test_plain_answer_is_not_a_tool_call():
    result = BifrostLlmGateway._extract_result(
        {"choices": [{"message": {"content": "A dog that is 7 is about 49."}}]}
    )
    assert result.tool_calls == []
    assert "49" in result.content
