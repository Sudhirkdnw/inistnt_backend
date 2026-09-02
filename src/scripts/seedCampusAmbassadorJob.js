const mongoose = require('mongoose');
const path = require('path');
const dotenv = require('dotenv');

// Load Environment variables
const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: path.resolve(__dirname, `../../.env.${nodeEnv}`) });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/social_mini';
const CareerJob = require('../models/careerJob.model');

const campusAmbassadorJob = {
  title: 'Campus Ambassador',
  department: 'Campus Ambassador Lead',
  location: 'Remote (India)',
  type: 'Internship',
  experience: 'Fresher / College Student',
  salary: 'Performance-Based Incentives + Referral Rewards',
  description: `Become the face of Hykee on your campus. 🎓

As a Campus Ambassador, you'll help introduce Hykee to students at your college, grow the student community, promote the platform through your network and social media, and help us understand what students actually want from a campus-focused social platform.

This is a flexible, student-friendly role where you can build real experience in community building, marketing, social media, networking and startup growth while helping Hykee expand across college campuses in India.`,
  responsibilities: [
    'Promote Hykee among students on your campus and through your personal network.',
    'Encourage students to register and create verified accounts on Hykee.',
    'Share your unique Hykee referral code/link with students.',
    'Promote Hykee through Instagram, WhatsApp groups, college communities and other relevant channels.',
    'Help create awareness about Hykee\'s Campus Connect, Communities and Team Finder features.',
    'Organize or support small campus-level promotional activities when possible.',
    'Collect feedback from students and share useful suggestions with the Hykee team.',
    'Help onboard new students and explain the platform to them when required.',
    'Create simple social media content/reels/stories to promote Hykee.',
    'Represent Hykee professionally within your college community.'
  ],
  requirements: [
    'Currently enrolled in a college/university in India.',
    'Strong communication and networking skills.',
    'Active on Instagram and/or other social platforms.',
    'Enthusiastic about startups, technology and student communities.',
    'Comfortable talking to and connecting with other students.',
    'Willing to promote Hykee within your campus.',
    'Self-motivated and able to work independently.',
    'No previous professional experience required.'
  ],
  perks: [
    'Flexible working hours',
    'Cool Startup Swag',
    'Official Hykee Campus Ambassador recognition',
    'Performance-based referral rewards',
    'Opportunity to work directly with an early-stage startup',
    'Hykee merchandise / startup swag for eligible ambassadors'
  ],
  customFields: [
    {
      fieldId: 'field_ca_1',
      label: 'Why do you want to become a Hykee Campus Ambassador?',
      fieldType: 'textarea',
      placeholder: 'Tell us why you want to represent Hykee on your campus.',
      options: [],
      required: true,
      helperText: ''
    },
    {
      fieldId: 'field_ca_2',
      label: 'College Name',
      fieldType: 'text',
      placeholder: 'Enter your college name',
      options: [],
      required: true,
      helperText: ''
    },
    {
      fieldId: 'field_ca_3',
      label: 'Current Year / Semester',
      fieldType: 'text',
      placeholder: 'Example: 2nd Year, Semester 3',
      options: [],
      required: true,
      helperText: ''
    },
    {
      fieldId: 'field_ca_4',
      label: 'Instagram Username',
      fieldType: 'text',
      placeholder: '@username',
      options: [],
      required: true,
      helperText: ''
    },
    {
      fieldId: 'field_ca_5',
      label: 'How will you promote Hykee on your campus?',
      fieldType: 'textarea',
      placeholder: 'Tell us your ideas for getting students to join Hykee.',
      options: [],
      required: true,
      helperText: ''
    },
    {
      fieldId: 'field_ca_6',
      label: 'How many students can you realistically reach through your college network?',
      fieldType: 'text',
      placeholder: 'Ex. 100+',
      options: [],
      required: true,
      helperText: ''
    },
    {
      fieldId: 'field_ca_7',
      label: 'What is your expectation from the Campus Ambassador program?',
      fieldType: 'textarea',
      placeholder: 'Write freely, please. Don\'t use ChatGPT.',
      options: [],
      required: true,
      helperText: ''
    }
  ],
  customHighlights: [
    { label: 'Work Mode', value: 'Remote / Campus Flexible' },
    { label: 'Rewards', value: 'Incentives + Swag' }
  ],
  applyType: 'INTERNAL_FORM',
  externalLink: '',
  contactEmail: 'sudhirknw@gmail.com',
  status: 'OPEN',
  featured: true
};

async function seedJob() {
  try {
    console.log(`Connecting to MongoDB at: ${MONGO_URI}`);
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully!');

    // Check if Campus Ambassador role already exists
    const existing = await CareerJob.findOne({ title: 'Campus Ambassador' });
    if (existing) {
      console.log('Found existing Campus Ambassador opening. Updating...');
      Object.assign(existing, campusAmbassadorJob);
      await existing.save();
      console.log('Updated Campus Ambassador opening successfully! ID:', existing._id);
    } else {
      console.log('Creating new Campus Ambassador opening...');
      const created = await CareerJob.create(campusAmbassadorJob);
      console.log('Created Campus Ambassador opening successfully! ID:', created._id);
    }

    console.log('Job post operation complete! 🎉');
  } catch (err) {
    console.error('Error seeding job:', err);
  } finally {
    await mongoose.disconnect();
  }
}

seedJob();
