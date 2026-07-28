import { NgModule } from '@angular/core';
import { ServerModule } from '@angular/platform-server';
import { AppModule } from './app.module';
import { AppComponent } from './app.component';

@NgModule({
  imports: [
    ServerModule,   // Angular Universal SSR
    AppModule,      // بيشمل كل الـ declarations والـ imports بتاعتنا
  ],
  bootstrap: [AppComponent],
})
export class AppServerModule {}
