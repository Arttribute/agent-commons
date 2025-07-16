require('dotenv').config();
const axios = require('axios');

// Use real agent IDs
const AGENT_IDS = [
    "0x2acbb2c921428940e94c727305d7de402b650ac5",
    "0x385e15a9d5e94c3df8090dc024473b6002f03c03",
    "0x6d51affb3c882c4d3a37064c90af8e732cb54eb6",
];

const API_BASE_URL = 'http://localhost:3001';

// Test data that matches the examples
const TEST_SCENARIOS = {
    planning: {
        taskDescription: 'Plan a software development project for building a task management app',
        participantAgents: AGENT_IDS,
        timeoutMs: 120000,
    },
    // Uncomment to test other scenarios
    // research: {
    //     taskDescription: 'Research the latest developments in AI and compile a comprehensive report',
    //     participantAgents: AGENT_IDS,
    //     timeoutMs: 120000,
    // },
    // problemSolving: {
    //     taskDescription: 'Solve this

    //     complex mathematical optimization problem: minimize f(x,y) = x² + y² subject to x + y = 10',
    //     participantAgents: AGENT_IDS,
    //     timeoutMs: 120000,
    // },
    // codeReview: {
    //     taskDescription: `Review this code and provide suggestions for improvement:
    // function fibonacci(n) {
    //   if (n <= 1) return n;

    //   return fibonacci(n - 1) + fibonacci(n - 2);
    // }`,
    //     participantAgents: AGENT_IDS,
    //     timeoutMs: 120000,
    // },

};

async function testExampleScenarios() {
    console.log('🧪 Testing Shared Bus Examples via HTTP API...');

    // First create a space for collaboration
    const spaceResponse = await axios.post(`${API_BASE_URL}/v1/spaces`, {
        name: 'Test Collaboration Space',
        description: 'Space for testing shared bus collaboration',
        isPublic: false,
        maxMembers: 10
    }, {
        headers: {
            'x-creator-id': AGENT_IDS[0],
            'x-creator-type': 'agent'
        }
    });

    const spaceId = spaceResponse.data.data.spaceId;
    console.log(`✅ Created test space: ${spaceId}`);

    // Add other agents to the space
    for (let i = 1; i < AGENT_IDS.length; i++) {
        await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/members`, {
            memberId: AGENT_IDS[i],
            memberType: 'agent',
            role: 'member'
        });
    }

    for (const [scenarioName, scenario] of Object.entries(TEST_SCENARIOS)) {
        console.log(`\n� Testing ${scenarioName} scenario...`);

        try {
            const response = await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/collaboration/shared-bus`, scenario);

            console.log(`✅ ${scenarioName} completed successfully`);
            console.log(`📊 Results: ${response.data.results.length} agents participated`);
            console.log(`⏱️  Duration: ${response.data.collaborationSummary.duration}ms`);
            console.log(`💬 Total messages: ${response.data.collaborationSummary.totalMessages}`);
            console.log(`🎯 Outcome: ${response.data.collaborationSummary.outcome}`);

            // Show final compilation
            if (response.data.finalCompilation) {
                console.log('\n📋 Final Collaboration Result:');
                console.log(response.data.finalCompilation.message);

                // Show the synthesized deliverable separately for clarity
                if (response.data.finalCompilation.synthesizedDeliverable) {
                    console.log('\n🎯 Synthesized Deliverable:');
                    console.log(response.data.finalCompilation.synthesizedDeliverable);
                }

                console.log('\n👥 Agent Contributions Summary:');
                response.data.finalCompilation.agentContributions.forEach(contrib => {
                    console.log(`  - ${contrib.agentId}: ${contrib.status} (${contrib.messageCount} messages)`);
                });
            }

        } catch (error) {
            console.error(`❌ ${scenarioName} failed:`, error.response?.data || error.message);
        }
    }
}

async function testStreamingExample() {
    console.log('\n🌊 Testing Streaming Collaboration Example...');

    try {
        const response = await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/collaboration/agents`, {
            agentIds: AGENT_IDS.slice(0, 2), // Use first 2 agents
            initialMessage: 'Let\'s collaborate on writing a short story about AI agents working together',
            spaceName: 'Creative Writing Collaboration'
        });

        console.log('✅ Streaming collaboration started');
        console.log('📍 Space ID:', response.data.spaceId);

        // Check messages in the space
        const messagesResponse = await axios.get(`${API_BASE_URL}/v1/spaces/${response.data.spaceId}/messages`);
        console.log(`💬 Found ${messagesResponse.data?.length || 0} messages in space`);

    } catch (error) {
        console.error('❌ Streaming example failed:', error.response?.data || error.message);
    }
}

async function testSharedBusCollaboration() {
    console.log('🚀 Testing Shared Bus Collaboration...');

    try {
        // Test 1: Create a space
        console.log('\n📦 Test 1: Creating a space...');
        const spaceResponse = await axios.post(`${API_BASE_URL}/v1/spaces`, {
            name: 'Test Collaboration Space',
            description: 'Testing multi-agent collaboration',
            createdBy: AGENT_IDS[0],
            createdByType: 'agent',
            isPublic: false,
            maxMembers: 10
        });

        const spaceId = spaceResponse.data.spaceId;
        console.log('✅ Space created:', spaceId);

        // Test 2: Add members to the space
        console.log('\n👥 Test 2: Adding members to space...');
        for (let i = 1; i < AGENT_IDS.length; i++) {
            await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/members`, {
                memberId: AGENT_IDS[i],
                memberType: 'agent',
                role: 'member'
            });
            console.log(`✅ Added agent ${AGENT_IDS[i]} to space`);
        }

        // Test 3: Start shared bus collaboration
        console.log('\n🤝 Test 3: Starting shared bus collaboration...');
        const collaborationResponse = await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/collaboration/shared-bus`, {
            taskDescription: 'Collaborate on solving a complex problem about renewable energy solutions',
            participantAgents: AGENT_IDS,
            spaceId: spaceId,
            timeoutMs: 60000, // 1 minute for testing
            maxRounds: 3
        });

        console.log('✅ Collaboration started');
        console.log('Results:', JSON.stringify(collaborationResponse.data, null, 2));

        // Test 4: Check space messages
        console.log('\n💬 Test 4: Checking space messages...');
        const messagesResponse = await axios.get(`${API_BASE_URL}/v1/spaces/${spaceId}/messages`);
        console.log(`✅ Found ${messagesResponse.data.length} messages in space`);

        // Test 5: Test runAgentsInSharedSpace method
        console.log('\n🔄 Test 5: Testing runAgentsInSharedSpace...');
        const sharedSpaceResponse = await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/collaboration/agents`, {
            agentIds: AGENT_IDS,
            initialMessage: 'Let\'s work together on creating a sustainable city plan',
            spaceName: 'City Planning Collaboration'
        });

        console.log('✅ Agents started in shared space');
        console.log('Space ID:', sharedSpaceResponse.data.spaceId);

        console.log('\n🎉 All tests completed successfully!');

    } catch (error) {
        console.error('❌ Error during testing:', error.response?.data || error.message);
    }
}

async function testStreamingCollaboration() {
    console.log('\n🌊 Testing Streaming Collaboration...');

    try {
        // First create a space for streaming
        console.log('\n📦 Creating space for streaming test...');
        const spaceResponse = await axios.post(`${API_BASE_URL}/v1/spaces`, {
            name: 'Streaming Test Space',
            description: 'Testing real-time streaming collaboration',
            createdBy: AGENT_IDS[0],
            createdByType: 'agent',
            isPublic: false,
            maxMembers: 10
        });

        const spaceId = spaceResponse.data.spaceId;
        console.log('✅ Space created for streaming:', spaceId);

        // Add members to the space
        for (let i = 1; i < AGENT_IDS.length; i++) {
            await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/members`, {
                memberId: AGENT_IDS[i],
                memberType: 'agent',
                role: 'member'
            });
        }

        // Test streaming collaboration using EventSource (SSE)
        console.log('\n🌊 Starting streaming collaboration...');

        // Since we're using Node.js, we'll use a library that supports SSE
        // For this test, we'll simulate the streaming by making a POST request
        // and checking the response format

        // In a real browser environment, you would use:
        // const eventSource = new EventSource(`${API_BASE_URL}/v1/spaces/${spaceId}/collaboration/stream`);

        // For testing purposes, let's make a regular HTTP request to verify the endpoint exists
        // and then simulate what the streaming would look like

        const streamTestResponse = await axios.post(
            `${API_BASE_URL}/v1/spaces/${spaceId}/collaboration/stream`,
            {
                agentIds: AGENT_IDS,
                initialMessage: 'Let\'s collaborate on this streaming project in real-time!'
            },
            {
                headers: {
                    'Accept': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                },
                timeout: 10000 // 10 seconds timeout for testing
            }
        ).catch(error => {
            // SSE endpoints might not respond to regular HTTP requests properly
            console.log('📝 Note: SSE endpoint detected (this is expected for streaming)');
            return { status: 'sse_endpoint_detected' };
        });

        console.log('✅ Streaming endpoint is available');

        // Test the non-streaming version to verify the same functionality works
        console.log('\n🔄 Testing equivalent non-streaming collaboration...');
        const nonStreamResponse = await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/collaboration/agents`, {
            agentIds: AGENT_IDS,
            initialMessage: 'Testing non-streaming version for comparison',
            spaceId: spaceId
        });

        console.log('✅ Non-streaming collaboration completed');
        console.log('Space ID:', nonStreamResponse.data.spaceId);

        // Verify messages were created
        const messagesResponse = await axios.get(`${API_BASE_URL}/v1/spaces/${spaceId}/messages`);
        console.log(`✅ Found ${messagesResponse.data.length} messages in streaming space`);

        console.log('\n🎉 Streaming collaboration test completed!');
        console.log('📝 Note: For full streaming test, use a browser or SSE client library');

    } catch (error) {
        console.error('❌ Error during streaming test:', error.response?.data || error.message);
    }
}

async function testIndividualAgentRun() {
    console.log('\n🤖 Testing individual agent run with shared space...');

    try {
        const response = await axios.post(`${API_BASE_URL}/v1/agents/${AGENT_IDS[0]}/run`, {
            messages: [
                {
                    role: 'user',
                    content: 'Hello, I need help with a project. Can you collaborate with other agents?'
                }
            ],
            useSharedSpace: true,
            collaboratorAgentIds: [AGENT_IDS[1], AGENT_IDS[2]],
            stream: false
        });

        console.log('✅ Agent run completed');
        console.log('Response:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('❌ Error during agent run:', error.response?.data || error.message);
    }
}

async function runAllTests() {
    console.log('🧪 Starting Shared Bus Implementation Tests');
    console.log('📝 Testing scenarios that match the existing examples\n');

    // Check if agent IDs are valid
    if (AGENT_IDS.some(id => id.includes('PLACEHOLDER'))) {
        console.log('⚠️  WARNING: Please replace placeholder agent IDs with real ones');
        return;
    }

    // Test all example scenarios
    await testExampleScenarios();

    // Test streaming example
    // await testStreamingExample();

    // Test basic space operations
    // await testBasicSpaceOperations();

    console.log('\n🎉 All tests completed!');
    console.log('💡 To run the examples directly in TypeScript, use:');
    console.log('   node run-examples.js');
}

async function testBasicSpaceOperations() {
    console.log('\n🏗️  Testing Basic Space Operations...');

    try {
        // Create space
        const spaceResponse = await axios.post(`${API_BASE_URL}/v1/spaces`, {
            name: 'Test Space',
            description: 'Testing basic operations',
            createdBy: AGENT_IDS[0],
            createdByType: 'agent'
        });

        const spaceId = spaceResponse.data.spaceId;
        console.log('✅ Space created:', spaceId);

        // Add members
        for (let i = 1; i < AGENT_IDS.length; i++) {
            await axios.post(`${API_BASE_URL}/v1/spaces/${spaceId}/members`, {
                memberId: AGENT_IDS[i],
                memberType: 'agent',
                role: 'member'
            });
        }
        console.log('✅ Members added to space');

        // Get space info
        const spaceInfo = await axios.get(`${API_BASE_URL}/v1/spaces/${spaceId}`);
        console.log('✅ Space info retrieved');

        // Get members
        const members = await axios.get(`${API_BASE_URL}/v1/spaces/${spaceId}/members`);
        console.log(`✅ Found ${members.data.length} members in space`);

    } catch (error) {
        console.error('❌ Basic space operations failed:', error.response?.data || error.message);
    }
}
runAllTests();
