import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QamosComponent } from './qamos.component';

describe('QamosComponent', () => {
  let component: QamosComponent;
  let fixture: ComponentFixture<QamosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [QamosComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QamosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
