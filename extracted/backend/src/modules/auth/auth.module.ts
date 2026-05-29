import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { GoogleService } from './google.service';
import { TenancyModule } from '../../common/tenancy/tenancy.module';

@Module({
  imports: [
    PassportModule,
    TenancyModule,
    JwtModule.register({}), // secrets passed per-call
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, GoogleService],
  exports: [AuthService],
})
export class AuthModule {}
