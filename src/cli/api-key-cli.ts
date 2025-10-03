import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ApiKeyManagementService } from '../api-key/application/services/api-key-management.service';
import { UserType, MarketplacePermission } from '../api-key/domain/enums';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const apiKeyService = app.get(ApiKeyManagementService);

  const command = process.argv[2];
  const args = process.argv.slice(3);

  try {
    switch (command) {
      case 'create':
        await handleCreateCommand(apiKeyService, args);
        break;
      case 'list':
        await handleListCommand(apiKeyService, args);
        break;
      case 'revoke':
        await handleRevokeCommand(apiKeyService, args);
        break;
      case 'rotate':
        await handleRotateCommand(apiKeyService, args);
        break;
      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error) {
    console.error('Command failed:', error.message);
    process.exit(1);
  } finally {
    await app.close();
  }
}

async function handleCreateCommand(service: ApiKeyManagementService, args: string[]) {
  if (args.length < 3) {
    console.error('Usage: npm run cli create <name> <userType> <userId> [options]');
    process.exit(1);
  }

  const [name, userType, userId] = args;
  
  // Parse optional arguments
  const options: any = { name, userType: userType as UserType, userId };
  
  for (let i = 3; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    
    switch (key) {
      case '--store-id':
        options.storeId = value;
        break;
      case '--tenant-id':
        options.tenantId = value;
        break;
      case '--expires':
        options.expiresAt = new Date(value);
        break;
      case '--ips':
        options.allowedIps = value.split(',');
        break;
    }
  }

  console.log('Creating API key...');
  const result = await service.createApiKey(options);
  
  console.log('\n✅ API Key created successfully!');
  console.log('📋 Details:');
  console.log(`   ID: ${result.id}`);
  console.log(`   Name: ${result.name}`);
  console.log(`   User Type: ${result.userType}`);
  console.log(`   Rate Limit Tier: ${result.rateLimitTier}`);
  console.log(`   Status: ${result.status}`);
  console.log(`   Expires: ${result.expiresAt || 'Never'}`);
  console.log('\n🔐 Credentials (SAVE THESE - They won\'t be shown again):');
  console.log(`   ${result.credentials}`);
  console.log('\n⚠️  Important: Store these credentials securely. They cannot be retrieved again.');
}

async function handleListCommand(service: ApiKeyManagementService, args: string[]) {
  if (args.length < 1) {
    console.error('Usage: npm run cli list <userId> [userType]');
    process.exit(1);
  }

  const [userId, userType] = args;
  
  console.log('Fetching API keys...');
  const apiKeys = await service.listApiKeys(userId, userType as UserType);
  
  if (apiKeys.length === 0) {
    console.log('No API keys found for this user.');
    return;
  }

  console.log(`\n📋 Found ${apiKeys.length} API key(s):\n`);
  
  apiKeys.forEach((key, index) => {
    console.log(`${index + 1}. ${key.name}`);
    console.log(`   ID: ${key.id}`);
    console.log(`   Key ID: ${key.keyId}`);
    console.log(`   User Type: ${key.userType}`);
    console.log(`   Status: ${key.status}`);
    console.log(`   Rate Limit: ${key.rateLimitTier}`);
    console.log(`   Created: ${key.createdAt.toISOString()}`);
    console.log(`   Expires: ${key.expiresAt?.toISOString() || 'Never'}`);
    console.log(`   Permissions: ${key.permissions.join(', ')}`);
    console.log('');
  });
}

async function handleRevokeCommand(service: ApiKeyManagementService, args: string[]) {
  if (args.length < 1) {
    console.error('Usage: npm run cli revoke <apiKeyId>');
    process.exit(1);
  }

  const [apiKeyId] = args;
  
  console.log(`Revoking API key ${apiKeyId}...`);
  await service.revokeApiKey(apiKeyId);
  
  console.log('✅ API key revoked successfully!');
}

async function handleRotateCommand(service: ApiKeyManagementService, args: string[]) {
  if (args.length < 1) {
    console.error('Usage: npm run cli rotate <apiKeyId>');
    process.exit(1);
  }

  const [apiKeyId] = args;
  
  console.log(`Rotating API key ${apiKeyId}...`);
  const result = await service.rotateApiKey(apiKeyId);
  
  console.log('\n✅ API key rotated successfully!');
  console.log('🔐 New Credentials (SAVE THESE - They won\'t be shown again):');
  console.log(`   ${result.credentials}`);
  console.log('\n⚠️  Important: Update your applications with the new credentials immediately.');
}

function showHelp() {
  console.log(`
🔐 Yuny API Key Management CLI

Usage: npm run cli <command> [arguments]

Commands:
  create <name> <userType> <userId> [options]  Create a new API key
  list <userId> [userType]                     List API keys for user
  revoke <apiKeyId>                           Revoke an API key
  rotate <apiKeyId>                           Rotate API key credentials
  help                                        Show this help

User Types:
  MERCHANT    - For merchant/store operations
  CONSUMER    - For consumer operations  
  PLATFORM    - For platform operations
  ADMIN       - For admin operations
  WEBHOOK     - For webhook operations
  PARTNER     - For partner integrations

Create Options:
  --store-id <id>        Store ID for merchant keys
  --tenant-id <id>       Tenant ID for multi-tenant setups
  --expires <date>       Expiration date (ISO format)
  --ips <ip1,ip2>        Comma-separated allowed IPs

Examples:
  # Create merchant API key
  npm run cli create "My Store API" MERCHANT user-123 --store-id store-456

  # Create consumer API key with expiration
  npm run cli create "Mobile App" CONSUMER user-789 --expires 2024-12-31T23:59:59Z

  # Create webhook API key with IP restrictions
  npm run cli create "Payment Webhook" WEBHOOK user-abc --ips 192.168.1.100,192.168.1.101

  # List all API keys for user
  npm run cli list user-123

  # List only merchant keys for user
  npm run cli list user-123 MERCHANT

  # Revoke API key
  npm run cli revoke api-key-id-here

  # Rotate API key credentials
  npm run cli rotate api-key-id-here
`);
}

// Run the CLI
main().catch(console.error);