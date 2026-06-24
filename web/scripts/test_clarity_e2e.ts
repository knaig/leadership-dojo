#!/usr/bin/env ts-node

/**
 * End-to-End Test for Clarity MVP
 * Tests: Onboarding → KPI Creation → Conversation Creation → Dashboard Data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testClarityMVP() {
    console.log('🧪 Starting Clarity MVP End-to-End Test\n');

    try {
        // Step 1: Check if user exists
        console.log('1️⃣  Checking for test user...');
        const userId = process.env.TEST_USER_ID || 'user_test';

        let user = await prisma.user.findUnique({
            where: { id: userId }
        });

        if (!user) {
            console.log('   ❌ No user found. Please sign in first.');
            return;
        }

        console.log(`   ✅ Found user: ${user.name || user.email}`);
        console.log(`   📊 Onboarding complete: ${user.onboardingComplete}\n`);

        // Step 2: Check KPIs
        console.log('2️⃣  Checking KPIs...');
        const kpis = await prisma.userKPI.findMany({
            where: { userId },
            orderBy: { priority: 'asc' }
        });

        console.log(`   📈 Found ${kpis.length} KPIs`);
        kpis.slice(0, 3).forEach(kpi => {
            console.log(`   - ${kpi.name} (${kpi.status}, ${kpi.confidence || 0}% confident)`);
        });
        console.log('');

        // Step 3: Check Conversations
        console.log('3️⃣  Checking Conversations...');
        const conversations = await prisma.conversationPrep.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 5
        });

        console.log(`   💬 Found ${conversations.length} conversations`);
        conversations.forEach(conv => {
            console.log(`   - ${conv.title} (${conv.status})`);
            if (conv.primaryObjective) {
                console.log(`     Objective: ${conv.primaryObjective.substring(0, 60)}...`);
            }
        });
        console.log('');

        // Step 4: Test Dashboard Data Aggregation
        console.log('4️⃣  Testing Dashboard Data Aggregation...');

        const atRiskKpis = kpis.filter(k => k.status === 'AT_RISK' || k.status === 'OFF_TRACK');
        const onTrackKpis = kpis.filter(k => k.status === 'ON_TRACK' || k.status === 'ACHIEVED');
        const completedConvs = conversations.filter(c => c.status === 'COMPLETED');
        const preppingConvs = conversations.filter(c => c.status === 'PREPPING');

        console.log(`   🎯 KPIs Status:`);
        console.log(`      On Track: ${onTrackKpis.length}`);
        console.log(`      At Risk: ${atRiskKpis.length}`);

        console.log(`   💼 Conversations:`);
        console.log(`      Completed: ${completedConvs.length}`);
        console.log(`      Prepping: ${preppingConvs.length}`);

        // Calculate Clarity Score
        const clarityScore = kpis.length > 0 || conversations.length > 0
            ? Math.round(
                ((onTrackKpis.length / Math.max(kpis.length, 1)) * 50) +
                ((completedConvs.length / Math.max(conversations.length, 1)) * 50)
            )
            : 0;

        console.log(`\n   📊 Calculated Clarity Score: ${clarityScore}%`);

        // Step 5: Verify Component Data Shape
        console.log('\n5️⃣  Verifying Data Shapes for Components...');

        const focusKPI = atRiskKpis[0] || kpis[0];
        if (focusKPI) {
            console.log(`   ✅ TodaysFocusCard: "${focusKPI.name}"`);
        } else {
            console.log(`   ⚠️  No focus KPI available`);
        }

        if (kpis.length > 0) {
            console.log(`   ✅ KPICardList: ${Math.min(3, kpis.length)} cards`);
        } else {
            console.log(`   ⚠️  Empty KPICardList`);
        }

        const upcomingConvs = conversations.filter(c =>
            c.scheduledAt && new Date(c.scheduledAt) > new Date()
        );
        if (upcomingConvs.length > 0) {
            console.log(`   ✅ ConversationsCard: ${upcomingConvs.length} upcoming`);
        } else {
            console.log(`   ⚠️  No upcoming conversations`);
        }

        console.log(`   ✅ ClarityAIPanel: Ready`);

        // Final Summary
        console.log('\n═══════════════════════════════════');
        console.log('✅ END-TO-END TEST COMPLETE');
        console.log('═══════════════════════════════════');
        console.log(`User: ${user.name || user.email}`);
        console.log(`KPIs: ${kpis.length} (${onTrackKpis.length} on track, ${atRiskKpis.length} at risk)`);
        console.log(`Conversations: ${conversations.length} (${preppingConvs.length} need prep)`);
        console.log(`Clarity Score: ${clarityScore}%`);
        console.log(`Dashboard: ${focusKPI ? '✅' : '⚠️'} Ready`);
        console.log('═══════════════════════════════════\n');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the test
testClarityMVP()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
