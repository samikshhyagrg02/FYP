#!/usr/bin/env node

/**
 * Seed community groups for MindBloom
 * Run: node server/scripts/seed-community-groups.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const CommunityGroup = require('../models/CommunityGroup');

const groups = [
  {
    name: 'Anxiety Support',
    description: 'A safe space to share experiences and coping strategies for managing anxiety.',
    topic: 'anxiety',
    icon: '🌊',
    color: '#8BCF9B'
  },
  {
    name: 'Depression & Low Mood',
    description: 'Connect with others who understand what you\'re going through. You\'re not alone.',
    topic: 'depression',
    icon: '🌤️',
    color: '#B8A4D4'
  },
  {
    name: 'Stress Management',
    description: 'Share tips and techniques for managing daily stress and finding balance.',
    topic: 'stress',
    icon: '🧘',
    color: '#8BCF9B'
  },
  {
    name: 'Relationships & Connection',
    description: 'Discuss relationships, boundaries, and building meaningful connections.',
    topic: 'relationships',
    icon: '💝',
    color: '#CDB4DB'
  },
  {
    name: 'Self-Care Corner',
    description: 'Share self-care practices, routines, and ways to prioritize your wellbeing.',
    topic: 'self-care',
    icon: '🌸',
    color: '#B8A4D4'
  },
  {
    name: 'Mindfulness & Meditation',
    description: 'Explore mindfulness practices, meditation techniques, and present-moment awareness.',
    topic: 'mindfulness',
    icon: '🧘‍♀️',
    color: '#8BCF9B'
  },
  {
    name: 'Sleep & Rest',
    description: 'Discuss sleep challenges, healthy sleep habits, and the importance of rest.',
    topic: 'sleep',
    icon: '😴',
    color: '#B8A4D4'
  },
  {
    name: 'Work-Life Balance',
    description: 'Navigate work stress, boundaries, and finding harmony between work and personal life.',
    topic: 'work-life-balance',
    icon: '⚖️',
    color: '#8BCF9B'
  },
  {
    name: 'General Support',
    description: 'A welcoming space for any topic related to mental health and wellbeing.',
    topic: 'general-support',
    icon: '💚',
    color: '#8BCF9B'
  }
];

async function seedGroups() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindbloom', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB\n');

    console.log('Checking existing groups...');
    const existingCount = await CommunityGroup.countDocuments();
    
    if (existingCount > 0) {
      console.log(`Found ${existingCount} existing groups.`);
      console.log('Skipping seed to avoid duplicates.');
      console.log('To re-seed, delete existing groups first.\n');
    } else {
      console.log('No existing groups found. Seeding...\n');
      
      for (const groupData of groups) {
        const group = new CommunityGroup(groupData);
        await group.save();
        console.log(`✓ Created: ${group.name}`);
      }
      
      console.log(`\n✅ Successfully seeded ${groups.length} community groups!`);
    }

    await mongoose.connection.close();
    console.log('\nDatabase connection closed.');
  } catch (error) {
    console.error('Error seeding groups:', error);
    process.exit(1);
  }
}

seedGroups();
