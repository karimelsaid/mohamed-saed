import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IslamicComponent } from './islamic.component';

describe('IslamicComponent', () => {
  let component: IslamicComponent;
  let fixture: ComponentFixture<IslamicComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [IslamicComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(IslamicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
