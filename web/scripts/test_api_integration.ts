import { prisma } from '../lib/prisma';

async function testAPIIntegration() {
    console.log('🧪 Starting API Integration Tests\n');

    const baseUrl = 'http://localhost:3000';
    let testResults: any[] = [];

    // Helper to log results
    const logTest = (name: string, status: 'PASS' | 'FAIL', details?: any) => {
        const icon = status === 'PASS' ? '✅' : '❌';
        console.log(`${icon} ${name}`);
        if (details) console.log(`   ${JSON.stringify(details)}`);
        testResults.push({ name, status, details });
    };

    try {
        // Get user ID from database
        const user = await prisma.user.findFirst();
        if (!user) {
            console.log('❌ No user found in database');
            return;
        }
        console.log(`📌 Testing with user: ${user.email}\n`);

        // Test 1: GET /api/kpis
        console.log('## Testing KPIs API\n');
        try {
            const kpisRes = await fetch(`${baseUrl}/api/kpis`, {
                headers: {
                    'Content-Type': 'application/json',
                    // Note: This won't work without auth in production
                }
            });
            const kpis = await kpisRes.json();
            logTest('GET /api/kpis', kpisRes.ok ? 'PASS' : 'FAIL', {
                status: kpisRes.status,
                count: Array.isArray(kpis) ? kpis.length : 'N/A'
            });
        } catch (e: any) {
            logTest('GET /api/kpis', 'FAIL', { error: e.message });
        }

        // Test 2: POST /api/kpis
        try {
            const newKPI = {
                metric: 'Test API Integration',
                targetValue: '100%',
                targetDate: new Date('2026-06-01').toISOString(),
                status: 'ON_TRACK',
                confidence: 70,
                type: 'BUSINESS',
                timeframe: 'QUARTERLY',
                isPersonal: false
            };
            const createRes = await fetch(`${baseUrl}/api/kpis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newKPI)
            });
            const created = await createRes.json();
            logTest('POST /api/kpis', createRes.ok ? 'PASS' : 'FAIL', {
                status: createRes.status,
                id: created?.id
            });

            // Test 3: PUT /api/kpis/[id] if create succeeded
            if (createRes.ok && created.id) {
                const updateRes = await fetch(`${baseUrl}/api/kpis/${created.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ confidence: 90 })
                });
                logTest('PUT /api/kpis/[id]', updateRes.ok ? 'PASS' : 'FAIL', {
                    status: updateRes.status
                });

                // Clean up: DELETE
                await fetch(`${baseUrl}/api/kpis/${created.id}`, { method: 'DELETE' });
            }
        } catch (e: any) {
            logTest('POST /api/kpis', 'FAIL', { error: e.message });
        }

        // Test 4: GET /api/conversations
        console.log('\n## Testing Conversations API\n');
        try {
            const conversationsRes = await fetch(`${baseUrl}/api/conversations`);
            const conversations = await conversationsRes.json();
            logTest('GET /api/conversations', conversationsRes.ok ? 'PASS' : 'FAIL', {
                status: conversationsRes.status,
                count: Array.isArray(conversations) ? conversations.length : 'N/A'
            });
        } catch (e: any) {
            logTest('GET /api/conversations', 'FAIL', { error: e.message });
        }

        // Test 5: POST /api/conversations
        try {
            const newConversation = {
                title: 'API Integration Test',
                type: '1:1 MEETING',
                primaryObjective: 'Test conversation creation via API',
                scheduledAt: new Date('2026-02-15T14:00:00Z').toISOString(),
                stakeholderName: 'Test Stakeholder',
                stakeholderRole: 'Developer'
            };
            const createConvRes = await fetch(`${baseUrl}/api/conversations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConversation)
            });
            const createdConv = await createConvRes.json();
            logTest('POST /api/conversations', createConvRes.ok ? 'PASS' : 'FAIL', {
                status: createConvRes.status,
                id: createdConv?.id
            });

            // Test 6: GET /api/conversations/[id]
            if (createConvRes.ok && createdConv.id) {
                const getConvRes = await fetch(`${baseUrl}/api/conversations/${createdConv.id}`);
                logTest('GET /api/conversations/[id]', getConvRes.ok ? 'PASS' : 'FAIL', {
                    status: getConvRes.status
                });

                // Clean up
                await fetch(`${baseUrl}/api/conversations/${createdConv.id}`, { method: 'DELETE' });
            }
        } catch (e: any) {
            logTest('POST /api/conversations', 'FAIL', { error: e.message });
        }

        // Test 7: GET /api/today
        console.log('\n## Testing Dashboard Aggregation\n');
        try {
            const todayRes = await fetch(`${baseUrl}/api/today`);
            const todayData = await todayRes.json();
            logTest('GET /api/today', todayRes.ok ? 'PASS' : 'FAIL', {
                status: todayRes.status,
                hasKPIs: !!todayData?.kpis,
                hasConversations: !!todayData?.upcomingConversations
            });
        } catch (e: any) {
            logTest('GET /api/today', 'FAIL', { error: e.message });
        }

        // Summary
        console.log('\n## Test Summary\n');
        const passed = testResults.filter(t => t.status === 'PASS').length;
        const failed = testResults.filter(t => t.status === 'FAIL').length;
        console.log(`✅ Passed: ${passed}`);
        console.log(`❌ Failed: ${failed}`);
        console.log(`📊 Total: ${testResults.length}`);

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

testAPIIntegration();
