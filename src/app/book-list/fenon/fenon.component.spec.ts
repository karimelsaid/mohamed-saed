import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FenonComponent } from './fenon.component';

describe('FenonComponent', () => {
  let component: FenonComponent;
  let fixture: ComponentFixture<FenonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FenonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FenonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
