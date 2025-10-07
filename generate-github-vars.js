#!/usr/bin/env node

/**
 * Helper script to generate GitHub Variables JSON from config.json
 * Usage: node generate-github-vars.js [--update]
 * 
 * Options:
 *   --update    Automatically update the GitHub variable if gh CLI is installed
 */

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function checkGhCli() {
    try {
        await execAsync('gh --version');
        return true;
    } catch (error) {
        return false;
    }
}

async function updateGitHubVariable(jsonData) {
    try {
        console.log('🔄 Updating GitHub variable...');
        
        // Check if we're in a git repository
        try {
            await execAsync('git rev-parse --is-inside-work-tree');
        } catch (error) {
            throw new Error('Not in a git repository');
        }
        
        // Get repository info
        const { stdout: remoteUrl } = await execAsync('git remote get-url origin');
        const repoMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
        
        if (!repoMatch) {
            throw new Error('Could not determine GitHub repository from git remote');
        }
        
        const [, owner, repo] = repoMatch;
        const repoName = `${owner}/${repo}`;
        
        console.log(`📦 Repository: ${repoName}`);
        
        // Update the variable
        const command = `gh variable set SCRAPER_PROJECTS --body '${JSON.stringify(jsonData)}'`;
        await execAsync(command);
        
        console.log('✅ GitHub variable updated successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to update GitHub variable:', error.message);
        return false;
    }
}

async function main() {
    try {
        // Check for --update flag
        const shouldUpdate = process.argv.includes('--update');
        
        // Read current config.json
        const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
        
        if (!config.projects || !Array.isArray(config.projects)) {
            console.error('❌ Invalid config.json format. Expected "projects" array.');
            process.exit(1);
        }
        
        // Generate GitHub Variables JSON
        const githubVars = config.projects.map(project => ({
            topic: project.topic,
            url: project.url,
            disabled: project.disabled || false
        }));
        
        console.log('🔧 GitHub Variables Configuration');
        console.log('================================');
        console.log('');
        
        // Try to update automatically if requested
        if (shouldUpdate) {
            const hasGhCli = await checkGhCli();
            
            if (!hasGhCli) {
                console.log('⚠️  GitHub CLI (gh) not found. Install it from: https://cli.github.com/');
                console.log('   Falling back to manual instructions...\n');
            } else {
                const success = await updateGitHubVariable(githubVars);
                if (success) {
                    console.log('');
                    console.log('📋 Updated projects:');
                    githubVars.forEach((project, index) => {
                        const status = project.disabled ? '❌ Disabled' : '✅ Enabled';
                        console.log(`   ${index + 1}. ${project.topic} - ${status}`);
                    });
                    console.log('');
                    console.log('🚀 Your GitHub Actions will now use this configuration!');
                    return;
                }
            }
        }
        
        // Manual instructions
        console.log('1. Go to your repository: Settings → Secrets and variables → Actions');
        console.log('2. Click "New repository variable"');
        console.log('3. Set Variable name: SCRAPER_PROJECTS');
        console.log('4. Set Variable value to:');
        console.log('');
        console.log(JSON.stringify(githubVars, null, 2));
        console.log('');
        console.log('✅ Copy the JSON above and paste it as the variable value');
        console.log('');
        console.log('💡 Tip: Run with --update flag to automatically update if you have GitHub CLI installed');
        console.log('   npm run github-vars -- --update');
        console.log('');
        console.log('📋 Summary:');
        githubVars.forEach((project, index) => {
            const status = project.disabled ? '❌ Disabled' : '✅ Enabled';
            console.log(`   ${index + 1}. ${project.topic} - ${status}`);
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
