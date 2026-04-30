import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RewayatComponent } from './rewayat.component';

describe('RewayatComponent', () => {
  let component: RewayatComponent;
  let fixture: ComponentFixture<RewayatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RewayatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RewayatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
