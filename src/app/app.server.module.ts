import { NgModule } from '@angular/core';
import { ServerModule } from '@angular/platform-server';
import { AppModule } from './app.module';
import { AppComponent } from './app.component';

@NgModule({
  imports: [
    AppModule,      // بيشمل كل الـ declarations والـ imports بتاعتنا
    ServerModule,   // Angular Universal SSR
  ],
  bootstrap: [AppComponent],
})
export class AppServerModule {}